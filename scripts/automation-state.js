import { createHash } from "node:crypto";

export const STATE_BRANCH = "jobmatch-agent-state";
export const hash = value => createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");

// Each logical job has a separate file. GitHub's file SHA is the write precondition.
// A reservation is persisted BEFORE creating any paid session. Never replay an
// uncertain session creation or GitHub publication automatically.
export async function reserveJob(github, binding) {
  const key = hash(binding);
  const path = `/contents/jobs/${key}.json`;
  try { await github("GET", `/git/ref/heads/${STATE_BRANCH}`); }
  catch (error) {
    if (error.status !== 404) throw error;
    try { await github("POST", "/git/refs", { ref: `refs/heads/${STATE_BRANCH}`, sha: binding.base_sha }); }
    catch (conflict) {
      if (![409, 422].includes(conflict.status)) throw conflict;
      await github("GET", `/git/ref/heads/${STATE_BRANCH}`);
    }
  }
  let sha, record;
  async function read() {
    const file = await github("GET", `${path}?ref=${STATE_BRANCH}`);
    if (file.encoding !== "base64" || file.size > 100000) throw new Error("Invalid workflow state file.");
    const value = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));
    if (value.key !== key || JSON.stringify(value.binding) !== JSON.stringify(binding)) throw new Error("Workflow state binding mismatch.");
    sha = file.sha; record = value;
  }
  async function update(fields) {
    const allowed = ["state", "session_id", "turn_id", "specification", "receipt", "patch_sha", "manifest_sha", "pr_url"];
    if (Object.keys(fields).some(k => !allowed.includes(k))) throw new Error("Unsupported workflow state field.");
    const value = { ...record, ...fields, updated_at: new Date().toISOString() };
    const encoded = JSON.stringify(value);
    if (Buffer.byteLength(encoded) > 100000) throw new Error("Workflow state is too large.");
    await github("PUT", path, { message: `Checkpoint ${binding.stage} issue #${binding.issue_number}`, branch: STATE_BRANCH,
      content: Buffer.from(encoded).toString("base64"), ...(sha ? { sha } : {}) });
    await read();
    if (JSON.stringify(record) !== encoded) throw new Error("Workflow checkpoint did not verify.");
  }
  let fresh = false;
  try { await read(); }
  catch (error) {
    if (error.status !== 404) throw error;
    record = { key, binding, state: "reserved", created_at: new Date().toISOString() };
    try { await update({ state: "reserved" }); fresh = true; }
    catch (conflict) {
      if (![409, 422].includes(conflict.status)) throw conflict;
      await read();
    }
  }
  return { key, fresh, get record() { return record; }, update };
}

export function requireKnownOutcome(job, allowed) {
  if (!job.fresh && !allowed.includes(job.record.state)) {
    throw new Error(`Workflow job ${job.key} is ${job.record.state}. Inspect its saved session and GitHub outcome before recovery; no new session was created.`);
  }
}
