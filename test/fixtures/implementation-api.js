import assert from "node:assert/strict";
import { stateRequest } from "./state-api.js";

const sessionId = "sess_implementation_test", turnId = "turn_test";
const patch = "diff --git a/src/generated.js b/src/generated.js\nnew file mode 100644\n--- /dev/null\n+++ b/src/generated.js\n@@ -0,0 +1 @@\n+export const generated = true;\n";
globalThis.fetch = async (url, options) => {
  const body = options.body ? JSON.parse(options.body) : null;
  if (url.startsWith("https://api.github.com/repos/example/demo")) {
    const state = stateRequest(options.method, url.slice("https://api.github.com/repos/example/demo".length), body);
    if (state) return state;
    assert.equal(options.method, "GET", "Generation may only write its bounded ledger, never issues or source branches");
    if (url.endsWith("/permission")) return Response.json({ permission: "write" });
    if (url.includes("/pulls?")) return Response.json([]);
    if (url.includes("/git/ref/")) return Response.json({}, { status: 404 });
    if (url.includes("/comments?")) return Response.json([]);
    if (url.endsWith("/issues/1")) return Response.json({ title: "Approved feature", body: "Only this feature.", state: "open", labels: [{ name: "factory-ready" }, { name: "ready-for-implementation" }] });
  }
  const base = "https://api.openai.com/v1/agents";
  if (url === `${base}/sessions`) {
    assert.equal(body.agent_id, "agent_implementation_test");
    assert.equal(body.environment.type, "openai_hosted");
    assert.equal(body.stream, true);
    assert.equal(body.environment.files.length, 2);
    assert.deepEqual(body.environment.network.allowed_domains, ["registry.npmjs.org"]);
    assert.equal(JSON.stringify(body).includes("test-only-github"), false);
    assert.equal(JSON.stringify(body).includes("test-only-openai"), false);
    const events = [{ type: "agent.session.created", session: { id: sessionId } }, { type: "agent.session.turn.completed", turn: { id: turnId, subagent_id: null } }];
    return new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } });
  }
  if (url.startsWith(`${base}/sessions/${sessionId}/artifacts?`)) return Response.json({ data: [
    { id: "art_patch", turn_id: turnId, path: "/workspace/outputs/implementation.patch" },
    { id: "art_result", turn_id: turnId, path: "/workspace/outputs/result.json" },
  ], has_more: false });
  if (url.endsWith("/art_patch/content")) return new Response(patch);
  if (url.endsWith("/art_result/content")) return Response.json({ status: "implemented", summary: "Added a test module.", blockers: [] });
  throw new Error(`Unexpected request: ${options.method} ${url}`);
};
