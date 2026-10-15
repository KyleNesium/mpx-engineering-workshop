import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { stateRequest } from "./state-api.js";
const session = { id: "session_test" }, turnId = "turn_test";
const issue = { title: "Remote filter", body: "Original request.", state: "open", labels: [], html_url: "https://github.com/example/demo/issues/1" };
const comments = [];
let specification;
const json = value => Response.json(value);
// All requests are intercepted. No real credentials or service calls.
globalThis.fetch = async (url, options) => {
  const body = options.body ? JSON.parse(options.body) : {};
  if (url === "https://api.openai.com/v1/agents/sessions") {
    assert.equal(options.method, "POST");
    assert.equal(body.environment.type, "none");
    assert.equal(body.stream, true);
    const input = JSON.parse(body.input);
    assert.equal(input.issue_number, 1);
    assert.equal(input.original_description, "Original request.");
    assert.deepEqual(body.agent.tools, []);
    assert.equal(body.agent.text.format.type, "json_schema");
    assert.ok(body.agent.instructions.startsWith("You are JobMatch Lab - Issue Refinement."));
    assert.equal(JSON.stringify(body).includes("test-only-github"), false);
    assert.equal(JSON.stringify(body).includes("test-only-openai"), false);
    if (["auth", "unsafe-error"].includes(process.env.FIXTURE_CASE)) {
      return Response.json({ error: {
        code: process.env.FIXTURE_CASE === "auth" ? "invalid_api_key" : "sk-test-only-openai",
        type: "invalid_request_error",
        message: "Incorrect API key provided: test-only-openai. Do not print this message.",
      } }, { status: 401 });
    }
    specification = { revision: input.revision, goal: "Add a remote-only filter.", desired_behavior: ["Filter fully remote roles."], scope: ["Explore jobs."], acceptance_criteria: ["An enabled filter excludes office roles."], tests: ["Verify search and category composition."], assumptions: [], questions: [] };
    if (process.env.FIXTURE_CASE === "stale") issue.body += " Human edit.";
    if (process.env.FIXTURE_CASE === "invalid") specification.repository = "attacker/repo";
    const events = [{ type: "agent.session.created", session }, { type: "agent.session.turn.completed", turn: { id: turnId, subagent_id: null } }];
    return new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(""));
  }
  if (url === "https://api.openai.com/v1/agents/sessions/session_test/items?order=desc&limit=100") return json({ has_more: false, data: [{ type: "message", role: "assistant", status: "completed", turn_id: turnId, phase: "final_answer", content: [{ type: "output_text", text: JSON.stringify(specification) }] }] });
  const prefix = "https://api.github.com/repos/example/demo";
  assert.ok(url.startsWith(prefix), `Unexpected URL: ${url}`);
  const path = url.slice(prefix.length);
  const state = stateRequest(options.method, path, body);
  if (state) return state;
  if (options.method === "GET" && path === "/git/ref/heads/main") return json({ object: { sha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim() } });
  if (options.method === "GET" && path === "/issues/1") return json(issue);
  if (options.method === "GET" && path.startsWith("/issues/1/comments?")) return json(comments);
  assert.notEqual(process.env.FIXTURE_CASE, "invalid", "Invalid output must not write the issue");
  if (options.method === "POST" && path === "/issues/1/comments") { comments.push({ id: 1, body: body.body, user: { login: "github-actions[bot]", type: "Bot" } }); return json(comments[0]); }
  if (options.method === "PATCH" && path === "/issues/1") { issue.body = body.body; return json(issue); }
  if (options.method === "POST" && path === "/labels") return json({});
  if (options.method === "POST" && path === "/issues/1/labels") { issue.labels = body.labels.map(name => ({ name })); return json(issue.labels); }
  throw new Error(`Unexpected GitHub operation: ${options.method} ${path}`);
};
