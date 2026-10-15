import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { consumeEvents, rootCompleted, failed } from "./agent-events.js";
import { exec, approvedEvent, approvalSnapshot, existingPR, branchFor, digest, checkPatch, checkManifest, checkMetadata, publishPR } from "./implementation-core.js";

import { reserveJob, requireKnownOutcome, hash } from "./automation-state.js";

const mode = process.argv[2];
if (!["generate", "validate", "publish"].includes(mode)) throw new Error("Select generate, validate, or publish.");
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
if (!approvedEvent(event)) throw new Error("Only a human-applied factory-ready label on an open issue starts implementation.");
const number = event.issue.number;
const repository = process.env.GITHUB_REPOSITORY;
const output = resolve(process.env.FACTORY_ARTIFACT_DIR || "");
if (!/^[-\w.]+\/[-\w.]+$/.test(repository || "") || !Number.isSafeInteger(number) || number < 1 || !process.env.FACTORY_ARTIFACT_DIR) throw new Error("Invalid implementation workflow context.");
const patchPath = join(output, "implementation.patch");
const metadataPath = join(output, "approval.json");
const manifestPath = join(output, "result.json");
const summary = async text => { if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, text + "\n"); };
const setOutput = async (name, value) => { if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`); };
const redact = value => [process.env.OPENAI_API_KEY, process.env.GITHUB_TOKEN].filter(Boolean)
  .reduce((text, secret) => text.replaceAll(secret, "[redacted]"), String(value)).replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 600);
async function github(method, path, body) {
  if (!process.env.GITHUB_TOKEN) throw new Error("Missing workflow GitHub token.");
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    method, headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) { const error = new Error(`GitHub ${method} failed (${response.status}).`); error.status = response.status; throw error; }
  return response.status === 204 ? null : response.json();
}
const apiHeaders = { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "OpenAI-Beta": "agents=v1", "Content-Type": "application/json" };
async function api(method, path, body, signal = AbortSignal.timeout(30000)) {
  const response = await fetch(`https://api.openai.com/v1/agents${path}`, { method, headers: apiHeaders, body: body ? JSON.stringify(body) : undefined, signal });
  if (!response.ok) { const failure = await response.json().catch(() => ({})); throw new Error(`Agents API failed (${response.status}): ${redact(failure.error?.message || "Check project access and quota.")}`); }
  return response;
}

if (mode === "generate") {
  const agentId = process.env.IMPLEMENTATION_AGENT_ID;
  if (!/^agent_[-\w]+$/.test(agentId || "") || !process.env.OPENAI_API_KEY) throw new Error("Configure IMPLEMENTATION_AGENT_ID and JOB_MATCH_LAB.");
  const actor = event.sender?.login;
  if (!/^[-\w]+$/.test(actor || "")) throw new Error("Missing label actor.");
  const permission = await github("GET", `/collaborators/${actor}/permission`);
  if (!["admin", "maintain", "write"].includes(permission.permission)) throw new Error("A repository maintainer must approve implementation.");
  const previous = await existingPR(github, repository.split("/")[0], number);
  if (previous) { await setOutput("has_patch", "false"); await summary(`Existing implementation PR: ${previous.html_url}. No new agent session started.`); process.exit(0); }
  try {
    await github("GET", `/git/ref/heads/${branchFor(number)}`);
    throw new Error("A factory branch already exists without a PR. Inspect it before retrying; it will not be overwritten.");
  } catch (error) { if (error.status !== 404) throw error; }
  const snapshot = await approvalSnapshot(github, number);
  const { stdout: base } = await exec("git", ["rev-parse", "HEAD"]);
  const baseSha = base.trim();
  const { stdout: archive } = await exec("git", ["archive", "--format=tar.gz", baseSha], { encoding: "buffer", maxBuffer: 6000000 });
  if (archive.length > 5 * 1024 * 1024) throw new Error("Workshop source archive exceeds the inline upload limit.");
  const instructions = await readFile("workshop/agents/issue-implementation.md", "utf8");
  const task = JSON.stringify({ issue_number: number, title: snapshot.issue.title, body: snapshot.issue.body, human_comments: snapshot.comments.filter(c => c.user?.type !== "Bot").map(c => ({ author: c.user.login, body: c.body })) });
  if (Buffer.byteLength(task) > 250000) throw new Error("Approved issue context is too large to process completely.");
  const job = await reserveJob(github, { stage: "implementation", repository, issue_number: number, base_sha: baseSha,
    revision: snapshot.revision, agent_id: agentId, instructions_sha: hash(instructions) });
  requireKnownOutcome(job, ["patch_ready"]);
  const timeout = AbortSignal.timeout(12 * 60000);
  let sessionId = job.record.session_id, turnId = job.record.turn_id, completed = false;
  if (job.fresh) {
    const stream = await api("POST", "/sessions", {
      agent_id: agentId, agent: { instructions, tools: [], multi_agent: { enabled: false } }, stream: true,
      environment: {
        type: "openai_hosted", container_size: "medium", network: { access: "restricted", allowed_domains: ["registry.npmjs.org"] },
        files: [
          { type: "inline", path: "/workspace/repository.tar.gz", data: archive.toString("base64") },
          { type: "inline", path: "/workspace/issue.json", data: Buffer.from(task).toString("base64") },
        ],
        setup_commands: [{ command: "mkdir -p /workspace/repo /workspace/outputs && tar -xzf /workspace/repository.tar.gz -C /workspace/repo && cd /workspace/repo && git init -q && git add . && git -c user.name=Workshop -c user.email=workshop@example.invalid commit -qm baseline && npm ci", cwd: "/workspace" }],
      },
      input: `Implement the approved issue #${number} from /workspace/issue.json in /workspace/repo. Follow the implementation instructions and AGENTS.md. Run npm run check. Publish /workspace/outputs/implementation.patch and /workspace/outputs/result.json, then report the actual result. Do not push, create a PR, or request credentials.`,
    }, timeout);
    try {
      completed = await consumeEvents(stream.body, async message => {
        if (message.session?.id) {
          if (!/^[-\w]+$/.test(message.session.id) || (sessionId && sessionId !== message.session.id)) throw new Error("Invalid implementation session.");
          if (!sessionId) { sessionId = message.session.id; await job.update({ state: "session_started", session_id: sessionId }); }
        }
        if (failed(message)) throw new Error(`Implementation failed: ${message.type} ${redact(message.error?.message || message.turn?.error?.message || "")}`);
        if (message.type === "agent.session.requires_action") throw new Error("Unexpected external tool request; use the hosted sandbox only.");
        if (rootCompleted(message)) { turnId = message.turn.id; return true; }
        return false;
      });
    } finally {
      try { await stream.body.cancel(); } catch { /* The stream may already be closed. */ }
      if (sessionId && !completed) {
        try { await api("POST", `/sessions/${sessionId}/events`, { events: [{ type: "agent.session.input.cancel" }] }); } catch { console.error("Unable to cancel the incomplete session; inspect it in the platform."); }
      }
    }
  }
  const metadata = { repository, issue_number: number, base_sha: baseSha, issue_revision: snapshot.revision, agent_id: agentId, session_id: sessionId, turn_id: turnId };
  checkMetadata(metadata, repository, number);
  const artifacts = [];
  let after;
  for (let page = 0; page < 20; page++) {
    const list = await (await api("GET", `/sessions/${sessionId}/artifacts?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`)).json();
    artifacts.push(...list.data);
    if (!list.has_more) break;
    if (!list.data.length || page === 19) throw new Error("Unable to read complete artifact list.");
    after = list.data.at(-1).id;
  }
  await mkdir(output, { recursive: true });
  for (const [path, destination, limit] of [["/workspace/outputs/implementation.patch", patchPath, 500000], ["/workspace/outputs/result.json", manifestPath, 10000]]) {
    const matches = artifacts.filter(a => a.turn_id === turnId && a.path === path);
    if (matches.length !== 1 || !/^[-\w]+$/.test(matches[0].id)) throw new Error(`Missing unique implementation artifact: ${path}`);
    const response = await api("GET", `/sessions/${sessionId}/artifacts/${matches[0].id}/content`);
    const content = Buffer.from(await response.arrayBuffer());
    if (!content.length || content.length > limit) throw new Error("Invalid artifact size.");
    await writeFile(destination, content);
  }
  checkManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  await checkPatch(patchPath);
  if (!job.fresh && (job.record.patch_sha !== digest(await readFile(patchPath)) || job.record.manifest_sha !== digest(await readFile(manifestPath)))) throw new Error("Saved implementation artifacts changed.");
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  await job.update({ state: "patch_ready", session_id: sessionId, turn_id: turnId, patch_sha: digest(await readFile(patchPath)), manifest_sha: digest(await readFile(manifestPath)) });
  await setOutput("has_patch", "true");
  await summary(`## Implementation patch received\n\n- Issue: #${number}\n- Agent: ${agentId}\n- Session: ${sessionId}\n- The validation job must pass before a draft PR is published.`);
} else {
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  checkMetadata(metadata, repository, number);
  checkManifest(manifest);
  const { stdout: base } = await exec("git", ["rev-parse", "HEAD"]);
  if (base.trim() !== metadata.base_sha) throw new Error("Checkout does not match the implementation base.");
  await checkPatch(patchPath);
  await exec("git", ["apply", "--index", patchPath]);
  if (mode === "validate") {
    const protectedArtifacts = await Promise.all([patchPath, metadataPath, manifestPath].map(path => readFile(path).then(digest)));
    const stagedBefore = (await exec("git", ["diff", "--cached", "--binary", "HEAD"])).stdout;
    const result = await exec("npm", ["run", "check"], { maxBuffer: 4000000, timeout: 5 * 60000, env: { ...process.env, OPENAI_API_KEY: "", GITHUB_TOKEN: "" } });
    console.log(result.stdout);
    await exec("git", ["diff", "--exit-code"]);
    const stagedAfter = (await exec("git", ["diff", "--cached", "--binary", "HEAD"])).stdout;
    const untracked = (await exec("git", ["ls-files", "--others", "--exclude-standard"])).stdout;
    const afterArtifacts = await Promise.all([patchPath, metadataPath, manifestPath].map(path => readFile(path).then(digest)));
    if (stagedBefore !== stagedAfter || untracked.trim() || JSON.stringify(protectedArtifacts) !== JSON.stringify(afterArtifacts)) throw new Error("Checks changed the patch, source, or approval artifacts.");
    await summary("## Runner validation passed\n\n`npm run check` passed. No write token or OpenAI key was supplied to the validation step.");
  } else {
    const instructions = await readFile("workshop/agents/issue-implementation.md", "utf8");
    const job = await reserveJob(github, { stage: "implementation", repository, issue_number: number, base_sha: metadata.base_sha,
      revision: metadata.issue_revision, agent_id: metadata.agent_id, instructions_sha: hash(instructions) });
    if (job.fresh || job.record.session_id !== metadata.session_id || job.record.turn_id !== metadata.turn_id ||
        job.record.patch_sha !== digest(await readFile(patchPath)) || job.record.manifest_sha !== digest(await readFile(manifestPath))) throw new Error("Validated artifacts do not match the saved job.");
    requireKnownOutcome(job, ["patch_ready", "publish_intent", "completed"]);
    if (["publish_intent", "completed"].includes(job.record.state)) {
      const prior = await existingPR(github, repository.split("/")[0], number);
      if (!prior) throw new Error("Uncertain PR publication; inspect the existing branch before recovery.");
      await job.update({ state: "completed", pr_url: prior.html_url });
      await summary(`Existing implementation PR: ${prior.html_url}`); process.exit(0);
    }
    await job.update({ state: "publish_intent" });
    const pr = await publishPR({ github, repository, number, baseBranch: event.repository.default_branch, metadata, manifest, cwd: process.cwd() });
    await job.update({ state: "completed", pr_url: pr.html_url });
    await summary(`## Implementation PR\n\n${pr.html_url}\n\nReview the code and the completed Codex review before merging.`);
    console.log(`Implementation PR: ${pr.html_url}`);
  }
}
