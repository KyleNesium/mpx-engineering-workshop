import test from "node:test";
import assert from "node:assert/strict";
import { reserveJob, requireKnownOutcome, STATE_BRANCH } from "../scripts/automation-state.js";

function fixture() {
  let branch = false, file, writes = 0, lostAcknowledgement = false;
  const github = async (method, path, body) => {
    const fail = status => { throw Object.assign(new Error("Fixture failure"), { status }); };
    if (method === "GET" && path === `/git/ref/heads/${STATE_BRANCH}`) { if (!branch) fail(404); return {}; }
    if (method === "POST" && path === "/git/refs") { assert.equal(body.ref, `refs/heads/${STATE_BRANCH}`); branch = true; return {}; }
    assert.match(path, /^\/contents\/jobs\/[a-f0-9]{64}\.json(?:\?ref=jobmatch-agent-state)?$/);
    if (method === "GET") { if (!file) fail(404); return structuredClone(file); }
    assert.equal(method, "PUT");
    assert.equal(body.branch, STATE_BRANCH);
    assert.equal(body.sha, file?.sha);
    writes++;
    file = { content: body.content, encoding: "base64", size: Buffer.byteLength(body.content, "base64"), sha: String(writes) };
    if (lostAcknowledgement) throw new Error("Lost write acknowledgement");
    return {};
  };
  return { github, loseAcknowledgement: () => { lostAcknowledgement = true; }, record: () => JSON.parse(Buffer.from(file.content, "base64").toString()) };
}
const binding = { stage: "refinement", repository: "example/demo", issue_number: 1, base_sha: "a".repeat(40), revision: "b".repeat(64), agent_id: "agent_test", instructions_sha: "c".repeat(64) };

test("reservation precedes paid work and an uncertain repeat cannot start another session", async () => {
  const f = fixture();
  const first = await reserveJob(f.github, binding);
  assert.equal(first.fresh, true);
  assert.equal(f.record().state, "reserved");
  const repeat = await reserveJob(f.github, binding);
  assert.equal(repeat.fresh, false);
  assert.throws(() => requireKnownOutcome(repeat, ["completed"]), /no new session/);
  await first.update({ state: "session_started", session_id: "sess_test" });
  const started = await reserveJob(f.github, binding);
  assert.equal(started.record.session_id, "sess_test");
  assert.throws(() => requireKnownOutcome(started, ["completed"]), /session_started/);
});

test("known results and PR receipts are readable without starting another paid session", async () => {
  const f = fixture();
  const job = await reserveJob(f.github, binding);
  await job.update({ state: "completed", session_id: "sess_test", pr_url: "https://github.com/example/demo/pull/2" });
  const repeat = await reserveJob(f.github, binding);
  requireKnownOutcome(repeat, ["completed"]);
  assert.equal(repeat.record.pr_url, "https://github.com/example/demo/pull/2");
  await assert.rejects(job.update({ credentials: "never allowed" }), /Unsupported/);
});

test("lost write acknowledgement leaves the persisted reservation in place", async () => {
  const f = fixture();
  f.loseAcknowledgement();
  await assert.rejects(reserveJob(f.github, binding), /Lost write acknowledgement/);
  const repeat = await reserveJob(f.github, binding);
  assert.equal(repeat.fresh, false);
  assert.throws(() => requireKnownOutcome(repeat, ["completed"]), /reserved/);
});
