import { readFile, appendFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createRefinementPublisher, shouldRun, refinementInstructions, specificationSchema, validateSpecification } from "./triage-core.js";
import { consumeEvents, rootCompleted, failed } from "./agent-events.js";
import { reserveJob, requireKnownOutcome, hash } from "./automation-state.js";

const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
if (!shouldRun(process.env.GITHUB_EVENT_NAME, event)) { console.log("Triage skipped: not a new open issue or human reply."); process.exit(0); }
const issueNumber = Number(event.issue?.number || event.inputs?.issue_number);
const repository = process.env.GITHUB_REPOSITORY;
const agentId = process.env.TRIAGE_AGENT_ID;
if (!/^[-\w.]+\/[-\w.]+$/.test(repository || "") || !Number.isSafeInteger(issueNumber) || issueNumber < 1) throw new Error("Invalid repository or issue.");
if (!/^agent_[-\w]+$/.test(agentId || "") || !process.env.OPENAI_API_KEY || !process.env.GITHUB_TOKEN) throw new Error("Set TRIAGE_AGENT_ID and JOB_MATCH_LAB.");
async function github(method, path, data) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    method, headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    body: data ? JSON.stringify(data) : undefined, signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) { const error = new Error(`GitHub ${method} failed (${response.status}).`); error.status = response.status; throw error; }
  return response.status === 204 ? null : response.json();
}
async function api(method, path, body, signal = AbortSignal.timeout(30000)) {
  const response = await fetch(`https://api.openai.com/v1/agents${path}`, { method,
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "OpenAI-Beta": "agents=v1", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, signal });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    // Log only bounded identifiers, never messages that could echo a credential.
    const details = [failure?.error?.code, failure?.error?.type]
      .filter(value => typeof value === "string" && /^[a-z_]{1,64}$/.test(value));
    throw new Error(`Agents API ${method} failed (${response.status}${details.length ? `; ${details.join(", ")}` : ""}). Check project access, permissions, and quota.`);
  }
  return response;
}
const baseSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const context = {};
for (const file of ["README.md", "AGENTS.md", "package.json", "server/catalog.js", "server/matching.js", "server/recommendations.js", "server/skills.js"]) context[file] = await readFile(file, "utf8");
const instructions = refinementInstructions(await readFile("WORKBOOK.md", "utf8"));
let sessionId;
const publisher = createRefinementPublisher({ github, issueNumber, context, sessionId: () => sessionId });
const input = await publisher.read();
const job = await reserveJob(github, { stage: "refinement", repository, issue_number: issueNumber, base_sha: baseSha,
  revision: input.revision, agent_id: agentId, instructions_sha: hash(instructions) });
requireKnownOutcome(job, ["result_ready", "publish_intent", "completed"]);
sessionId = job.record.session_id;
if (["completed", "publish_intent"].includes(job.record.state)) {
  if (!await publisher.check(job.record.specification)) throw new Error("Saved publication needs reconciliation. Inspect state and the issue before recovery.");
  await job.update({ state: "completed" });
  console.log(`Existing refinement verified for issue #${issueNumber}; no new session created.`); process.exit(0);
}
try {
  if (job.fresh) {
    const timeout = AbortSignal.timeout(240000);
    const stream = await api("POST", "/sessions", {
      agent_id: agentId, agent: { instructions, tools: [], multi_agent: { enabled: false },
        text: { format: { type: "json_schema", schema: specificationSchema }, verbosity: "medium" } },
      environment: { type: "none" }, stream: true,
      input: JSON.stringify({ repository, issue_number: issueNumber, source_revision: baseSha, ...input }),
    }, timeout);
    let completed = false, turnId;
    try {
      completed = await consumeEvents(stream.body, async message => {
        if (message.session?.id) {
          if (!/^[-\w]+$/.test(message.session.id) || (sessionId && sessionId !== message.session.id)) throw new Error("Invalid session ID.");
          if (!sessionId) { sessionId = message.session.id; await job.update({ state: "session_started", session_id: sessionId }); console.log(`Triage session: ${sessionId}, issue #${issueNumber}`); }
        }
        if (failed(message) || message.type === "agent.session.requires_action") throw new Error("Refinement must complete without tool requests.");
        if (rootCompleted(message)) { turnId = message.turn.id; return true; }
        return false;
      });
    } finally {
      try { await stream.body.cancel(); } catch { /* Already closed. */ }
      if (sessionId && !completed) {
        try { await api("POST", `/sessions/${sessionId}/events`, { events: [{ type: "agent.session.input.cancel" }] }); }
        catch { console.error("Inspect the incomplete session in the platform; cancellation could not be confirmed."); }
      }
    }
    if (!completed || !sessionId || !/^[-\w]+$/.test(turnId || "")) throw new Error("A completed root turn is required.");
    const page = await (await api("GET", `/sessions/${sessionId}/items?order=desc&limit=100`)).json();
    if (page.has_more || !Array.isArray(page.data)) throw new Error("Unable to read complete refinement output.");
    const finals = page.data.filter(i => i.type === "message" && i.role === "assistant" && i.turn_id === turnId && i.status === "completed" && (i.phase == null || i.phase === "final_answer"));
    if (finals.length !== 1 || !Array.isArray(finals[0].content) || !finals[0].content.length || !finals[0].content.every(c => c.type === "output_text" && typeof c.text === "string")) throw new Error("One completed text result is required.");
    const output = finals[0].content.map(c => c.text).join("");
    if (Buffer.byteLength(output) > 24000) throw new Error("Refinement result is too large.");
    const specification = JSON.parse(output);
    validateSpecification(specification);
    if (specification.revision !== input.revision) throw new Error("Result does not match the triggering issue revision.");
    await job.update({ state: "result_ready", turn_id: turnId, specification });
  }
  const head = await github("GET", `/git/ref/heads/${encodeURIComponent(event.repository?.default_branch || "main")}`);
  if (head.object.sha !== baseSha) throw new Error("Source changed during refinement. Reconcile the saved job before retrying.");
  await job.update({ state: "publish_intent" });
  const receipt = await publisher.publish(job.record.specification);
  await job.update({ state: "completed", receipt });
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Runner refinement verified\n\n- Issue: https://github.com/${repository}/issues/${issueNumber}\n- Agent: ${agentId}\n- Session: ${sessionId}\n- Job: ${job.key}\n- Agent returned JSON without tools; runner validated and published it.\n`);
  console.log("Runner updated the issue and questions comment; GitHub readback passed.");
} catch (error) {
  if (job.record.state !== "publish_intent") { try { await job.update({ state: "held" }); } catch { /* Reservation still prevents a new paid run. */ } }
  throw error;
}
