import test from "node:test";
import assert from "node:assert/strict";
import { shouldRun, splitBody, revision, validateSpecification, createRefinementPublisher, refinementInstructions, START, END, BOT } from "../scripts/triage-core.js";
import { consumeEvents, rootCompleted, failed } from "../scripts/agent-events.js";

test("refinement uses only the marked prompt and refuses ambiguous or damaged workbook content", () => {
  const block = "<!-- jobmatch-refinement-instructions:start -->\n```text\nRefine the triggering issue.\n```\n<!-- jobmatch-refinement-instructions:end -->";
  assert.equal(refinementInstructions(`Other exercise instructions.\n${block}\nUnrelated deployment prompt.`), "Refine the triggering issue.");
  assert.equal(refinementInstructions(block.replaceAll("\n", "\r\n")), "Refine the triggering issue.");
  for (const invalid of ["No marked prompt.", block + block, block.replace("```text", "```js"), block.replace("Refine the triggering issue.", " "), block.replace("<!-- jobmatch-refinement-instructions:end -->", "")]) {
    assert.throws(() => refinementInstructions(invalid));
  }
});

function fixture() {
  const issue = { title: "Remote filter", body: "Original requirements.", state: "open", labels: [{ name: "enhancement" }], html_url: "https://github.com/example/demo/issues/1" };
  const comments = [];
  const calls = [];
  async function github(method, path, data) {
    calls.push({ method, path, data });
    if (method === "GET" && path === "/issues/1") return structuredClone(issue);
    if (method === "GET" && path.startsWith("/issues/1/comments?")) return structuredClone(comments);
    if (method === "POST" && path === "/issues/1/comments") { comments.push({ id: 1, body: data.body, user: { login: BOT, type: "Bot" } }); return {}; }
    if (method === "PATCH" && path === "/issues/comments/1") { comments[0].body = data.body; return {}; }
    if (method === "PATCH" && path === "/issues/1") { issue.body = data.body; return {}; }
    if (method === "POST" && path === "/labels") return {};
    if (method === "POST" && path === "/issues/1/labels") { issue.labels = [...issue.labels.filter(l => !data.labels.includes(l.name)), ...data.labels.map(name => ({ name }))]; return {}; }
    if (method === "DELETE" && path.startsWith("/issues/1/labels/")) { issue.labels = issue.labels.filter(l => l.name !== path.split("/").at(-1)); return null; }
    throw new Error(`Unexpected ${method} ${path}`);
  }
  const gateway = createRefinementPublisher({ github, issueNumber: 1, context: {}, sessionId: () => "session_test" });
  return { issue, comments, calls, gateway, github };
}
const spec = revision => ({ revision, goal: "Add a remote-only filter.", desired_behavior: ["Remote roles remain visible."], scope: ["Explore jobs."], acceptance_criteria: ["Only remote roles appear when enabled."], tests: ["Check search and category composition."], assumptions: [], questions: [] });

test("triage triggers for new issues and human comments, never PRs or bot replies", () => {
  const issue = { number: 1, state: "open" };
  assert.equal(shouldRun("issues", { issue, action: "opened" }), true);
  assert.equal(shouldRun("issue_comment", { issue, action: "created", comment: { user: { type: "User", login: "demo" } } }), true);
  assert.equal(shouldRun("issue_comment", { issue, action: "created", comment: { user: { type: "Bot", login: BOT } } }), false);
  assert.equal(shouldRun("issue_comment", { issue: { ...issue, pull_request: {} }, action: "created", comment: { user: { type: "User" } } }), false);
});
test("blocking questions prevent readiness; malformed output cannot publish", () => {
  const args = spec("a".repeat(64));
  args.questions = [{ question: "Should hybrid roles count?", blocking: true }];
  assert.equal(validateSpecification(args), "needs-info");
  assert.throws(() => validateSpecification({ ...args, repository: "another/repo" }));
  assert.throws(() => validateSpecification({ ...spec("a".repeat(64)), acceptance_criteria: [] }));
});
test("runner publishes validated JSON and upserts questions without duplicate sections", async () => {
  const f = fixture();
  let context = await f.gateway.read();
  await f.gateway.publish({ ...spec(context.revision), questions: [{ question: "Should hybrid roles count?", blocking: true }] });
  assert.ok(f.issue.body.startsWith("Original requirements."));
  assert.equal(f.comments.length, 1);
  assert.match(f.comments[0].body, /Should hybrid roles count/);
  assert.deepEqual(f.issue.labels.map(l => l.name), ["enhancement", "needs-info"]);
  f.comments.push({ id: 2, body: "Only fully remote roles.", user: { type: "User", login: "author" } });
  context = await f.gateway.read();
  await f.gateway.publish(spec(context.revision));
  context = await f.gateway.read();
  await f.gateway.publish(spec(context.revision));
  assert.equal(f.comments.length, 2);
  assert.equal(f.issue.body.split(START).length - 1, 1);
  assert.deepEqual(f.issue.labels.map(l => l.name), ["enhancement", "ready-for-implementation"]);
  assert.equal(f.gateway.verified(), true);
  assert.equal(await f.gateway.check(spec(context.revision)), true);
});
test("stale inputs and closed issues cannot be overwritten", async () => {
  const f = fixture();
  const context = await f.gateway.read();
  f.issue.body += " Human amendment.";
  await assert.rejects(f.gateway.publish(spec(context.revision)), /changed/);
  assert.equal(f.calls.filter(c => c.method === "PATCH").length, 0);
  f.issue.state = "closed";
  await assert.rejects(f.gateway.read(), /open issue/);
});
test("success requires the questions comment to survive GitHub readback", async () => {
  const f = fixture();
  const gateway = createRefinementPublisher({
    issueNumber: 1, context: {}, sessionId: () => "session_test",
    github: async (method, path, data) => {
      const result = await f.github(method, path, data);
      if (method === "POST" && path === "/issues/1/labels") f.comments[0].body = "Changed during publication.";
      return result;
    },
  });
  const context = await gateway.read();
  await assert.rejects(gateway.publish(spec(context.revision)), /did not verify/);
  assert.equal(gateway.verified(), false);
});
test("human text outside the managed section survives replacement", () => {
  const body = `Before\n${START}\nOld generated section\n${END}\nHuman afterword`;
  assert.deepEqual(splitBody(body), { original: "Before\n", managed: `${START}\nOld generated section\n${END}`, suffix: "\nHuman afterword" });
  assert.throws(() => splitBody(`${START}missing end`));
});
test("bot comments do not change the input revision; human replies do", () => {
  const f = fixture();
  const before = revision(f.issue, []);
  assert.equal(revision(f.issue, [{ user: { type: "Bot", login: BOT }, body: "Bot output" }]), before);
  assert.notEqual(revision(f.issue, [{ id: 1, user: { type: "User", login: "author" }, body: "An answer" }]), before);
});
test("publisher rejects issue markers without a bot receipt", async () => {
  const f = fixture();
  f.issue.body += `\n${START}\nUser-supplied marker\n${END}`;
  const context = await f.gateway.read();
  await assert.rejects(f.gateway.publish(spec(context.revision)), /Unrecognized/);
});

test("SSE handles chunked CRLF and UTF-8; idle is not completion", async () => {
  const records = [{ type: "agent.session.idle" }, { type: "agent.session.turn.output_text.done", text: "Prüfung" }, { type: "agent.session.turn.completed", turn: { subagent_id: null } }];
  const bytes = new TextEncoder().encode(records.map(e => `data: ${JSON.stringify(e)}\r\n\r\n`).join(""));
  async function* chunks() { for (let i = 0; i < bytes.length; i++) yield bytes.slice(i, i + 1); }
  const seen = [];
  assert.equal(await consumeEvents(chunks(), e => { seen.push(e); return rootCompleted(e); }), true);
  assert.deepEqual(seen, records);
  assert.equal(rootCompleted(records[0]), false);
  assert.equal(rootCompleted({ type: "agent.session.turn.completed", turn: { subagent_id: "child" } }), false);
});
test("closed and failed event streams do not count as success", async () => {
  async function* chunks() { yield new TextEncoder().encode('data: {"type":"agent.session.idle"}\n\n'); }
  assert.equal(await consumeEvents(chunks(), rootCompleted), false);
  assert.equal(failed({ type: "agent.session.turn.failed", turn: { subagent_id: null } }), true);
  assert.equal(failed({ type: "agent.session.requires_action" }), false);
});

test("publishing a managed section leaves the human input revision stable", async () => {
  const f = fixture();
  const input = await f.gateway.read();
  await f.gateway.publish(spec(input.revision));
  assert.equal((await f.gateway.read()).revision, input.revision);
  assert.equal(await f.gateway.check(spec(input.revision)), true);
});
