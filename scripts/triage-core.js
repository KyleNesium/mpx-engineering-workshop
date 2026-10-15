import { createHash } from "node:crypto";

export const START = "<!-- jobmatch-triage:start -->";
export const END = "<!-- jobmatch-triage:end -->";
export const COMMENT = "<!-- jobmatch-triage:questions -->";
export const BOT = "github-actions[bot]";
export const STATUSES = ["needs-info", "ready-for-implementation"];

export function refinementInstructions(workbook) {
  const start = "<!-- jobmatch-refinement-instructions:start -->";
  const end = "<!-- jobmatch-refinement-instructions:end -->";
  const first = workbook.indexOf(start);
  const last = workbook.indexOf(end);
  if (first < 0 || last <= first || workbook.indexOf(start, first + start.length) !== -1 || workbook.indexOf(end, last + end.length) !== -1) {
    throw new Error("WORKBOOK.md must contain one complete issue-refinement instructions block.");
  }
  const block = workbook.slice(first + start.length, last).trim();
  const match = /^```text\r?\n([\s\S]+?)\r?\n```$/.exec(block);
  if (!match || !match[1].trim() || match[1].length > 20000) throw new Error("Invalid issue-refinement prompt in WORKBOOK.md.");
  return match[1].trim();
}

export function splitBody(body = "") {
  const start = body.indexOf(START);
  const end = body.indexOf(END);
  if (start === -1 && end === -1) return { original: body, managed: "" };
  if (start < 0 || end < start || body.indexOf(START, start + START.length) !== -1 || body.indexOf(END, end + END.length) !== -1) {
    throw new Error("Invalid triage markers. Restore the issue's original text before retrying.");
  }
  // Keep human text before AND after the managed block.
  return { original: body.slice(0, start), suffix: body.slice(end + END.length), managed: body.slice(start, end + END.length) };
}

export function revision(issue, comments) {
  const parts = splitBody(issue.body || "");
  return createHash("sha256").update(JSON.stringify({
    title: issue.title, original: parts.original.trimEnd(), suffix: parts.suffix || "",
    comments: comments.filter(c => c.user?.type !== "Bot").map(c => ({ id: c.id, author: c.user.login, body: c.body })),
  })).digest("hex");
}

const fields = ["revision", "goal", "desired_behavior", "scope", "acceptance_criteria", "tests", "assumptions", "questions"];
export const specificationSchema = {
  type: "object", additionalProperties: false,
  properties: {
    revision: { type: "string" }, goal: { type: "string" },
    ...Object.fromEntries(["desired_behavior", "scope", "acceptance_criteria", "tests", "assumptions"].map(k => [k, { type: "array", items: { type: "string" } }])),
    questions: { type: "array", items: { type: "object", additionalProperties: false, properties: { question: { type: "string" }, blocking: { type: "boolean" } }, required: ["question", "blocking"] } },
  }, required: fields,
};

function validText(value) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 3000 && !value.includes("<!--") && !value.includes("-->");
}

export function validateSpecification(args) {
  if (!args || typeof args !== "object" || Array.isArray(args) || Object.keys(args).some(k => !fields.includes(k)) || fields.some(k => !(k in args))) throw new Error("Invalid specification fields.");
  if (!/^[a-f0-9]{64}$/.test(args.revision) || !validText(args.goal)) throw new Error("Invalid revision or goal.");
  for (const key of ["desired_behavior", "scope", "acceptance_criteria", "tests", "assumptions"]) {
    if (!Array.isArray(args[key]) || args[key].length > 20 || !args[key].every(validText)) throw new Error(`Invalid ${key}.`);
  }
  if (!Array.isArray(args.questions) || args.questions.length > 12 || !args.questions.every(q => q && Object.keys(q).length === 2 && validText(q.question) && typeof q.blocking === "boolean")) throw new Error("Invalid questions.");
  const status = args.questions.some(q => q.blocking) ? "needs-info" : "ready-for-implementation";
  if (status === "ready-for-implementation" && (!args.acceptance_criteria.length || !args.desired_behavior.length || !args.tests.length)) throw new Error("Ready specifications require behavior, acceptance criteria, and tests.");
  if (JSON.stringify(args).length > 24000) throw new Error("Specification is too large.");
  return status;
}

function list(items) { return items.length ? items.map(s => `- ${s}`).join("\n") : "No additional information provided."; }

export function renderSpecification(args, status) {
  return [START, `<!-- revision:${args.revision} -->`, "## Implementation specification", `**Status:** ${status}`, "### Goal", args.goal,
    ...[["Desired behavior", args.desired_behavior], ["Scope and boundaries", args.scope], ["Acceptance criteria", args.acceptance_criteria], ["Verification", args.tests], ["Assumptions / proposals (not approved requirements)", args.assumptions], ["Open points", args.questions.map(q => `${q.blocking ? "Blocking" : "Optional"}: ${q.question}`)]].flatMap(([heading, values]) => [`### ${heading}`, list(values)]), END].join("\n\n");
}

export function renderQuestions(args, status, sessionId) {
  return [COMMENT, "## Issue refinement", `**Status:** ${status}`, args.questions.length ? "Please answer the following questions in a comment. Your reply starts another refinement pass." : "The specification is ready for a separate implementation step. This is not an implementation approval.",
    ...args.questions.map((q, i) => `${i + 1}. **${q.blocking ? "Required" : "Optional"}:** ${q.question}`),
    `Session: \`${sessionId}\``, `<!-- revision:${args.revision} -->`].join("\n\n");
}

export function shouldRun(eventName, event) {
  if (eventName === "workflow_dispatch") return /^\d+$/.test(String(event.inputs?.issue_number || ""));
  if (!event.issue || event.issue.pull_request || event.issue.state !== "open") return false;
  if (eventName === "issues") return event.action === "opened";
  return eventName === "issue_comment" && event.action === "created" && event.comment?.user?.type !== "Bot" && event.comment?.user?.login !== BOT;
}

export function createRefinementPublisher({ github, issueNumber, context, sessionId }) {
  let successfulWrite = false;
  async function snapshot() {
    const issue = await github("GET", `/issues/${issueNumber}`);
    if (issue.pull_request || issue.state !== "open") throw new Error("Only the triggering open issue can be refined.");
    if (issue.labels.some(l => l.name === "triage-disabled")) throw new Error("Triage is disabled for this issue.");
    const comments = [];
    for (let page = 1; page <= 20; page++) {
      const batch = await github("GET", `/issues/${issueNumber}/comments?per_page=100&page=${page}`);
      comments.push(...batch);
      if (batch.length < 100) return { issue, comments, revision: revision(issue, comments) };
    }
    throw new Error("Too many comments to process completely.");
  }
  async function read() {
    const snap = await snapshot();
    const parts = splitBody(snap.issue.body || "");
    const result = { revision: snap.revision, title: snap.issue.title, original_description: parts.original + (parts.suffix || ""), previous_specification: parts.managed, comments: snap.comments.filter(c => c.user?.type !== "Bot").map(c => ({ author: c.user.login, body: c.body })), project_context: context };
    if (JSON.stringify(result).length > 250000) throw new Error("Issue context is too large to process completely.");
    return result;
  }
  async function publish(args) {
    successfulWrite = false;
    const status = validateSpecification(args);
    const snap = await snapshot();
    if (snap.revision !== args.revision) throw new Error("Issue or answers changed. Read it again before writing.");
    const parts = splitBody(snap.issue.body || "");
    const receipt = snap.comments.find(c => c.user?.login === BOT && c.body.startsWith(COMMENT));
    if (parts.managed && !receipt) throw new Error("Unrecognized managed block; refusing to replace human content.");
    const body = parts.managed ? parts.original + renderSpecification(args, status) + (parts.suffix || "") : (snap.issue.body || "") + "\n\n" + renderSpecification(args, status);
    if (body.length > 60000) throw new Error("Issue body would be too large.");
    const questions = renderQuestions(args, status, sessionId());
    // Only the runner publishes this validated result. It upserts one comment
    // and one managed section without giving the agent GitHub tools.
    if (receipt) await github("PATCH", `/issues/comments/${receipt.id}`, { body: questions });
    else await github("POST", `/issues/${issueNumber}/comments`, { body: questions });
    // Reread immediately before the body update so manual edits are preserved.
    const fresh = await snapshot();
    if (fresh.issue.body !== snap.issue.body || fresh.revision !== snap.revision) throw new Error("Issue changed during publication. Read again and retry.");
    await github("PATCH", `/issues/${issueNumber}`, { body });
    for (const name of STATUSES) {
      try { await github("POST", "/labels", { name, color: name === "needs-info" ? "D876E3" : "0E8A16" }); }
      catch (error) { if (error.status !== 422) throw error; }
    }
    await github("POST", `/issues/${issueNumber}/labels`, { labels: [status] });
    const opposite = STATUSES.find(name => name !== status);
    if (fresh.issue.labels.some(l => l.name === opposite)) await github("DELETE", `/issues/${issueNumber}/labels/${opposite}`);
    const verified = await snapshot();
    const receipts = verified.comments.filter(c => c.user?.login === BOT && c.body.startsWith(COMMENT));
    if (!verified.issue.body.includes(renderSpecification(args, status)) || !verified.issue.labels.some(l => l.name === status) || verified.issue.labels.some(l => l.name === opposite) || receipts.length !== 1 || receipts[0].body !== questions) throw new Error("Issue update did not verify.");
    successfulWrite = true;
    return { issue_url: verified.issue.html_url, status, questions: args.questions.length, updated_by_runner: true };
  }
  async function check(args) {
    const status = validateSpecification(args);
    const snap = await snapshot();
    const receipts = snap.comments.filter(c => c.user?.login === BOT && c.body.startsWith(COMMENT));
    return snap.revision === args.revision && snap.issue.body.includes(renderSpecification(args, status)) &&
      snap.issue.labels.some(l => l.name === status) && !snap.issue.labels.some(l => STATUSES.includes(l.name) && l.name !== status) &&
      receipts.length === 1 && receipts[0].body === renderQuestions(args, status, sessionId());
  }
  return { read, publish, check, verified: () => successfulWrite };
}
