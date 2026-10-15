import assert from "node:assert/strict";
import { STATE_BRANCH } from "../../scripts/automation-state.js";
let branch = false;
const files = new Map();
export function stateRequest(method, path, body) {
  if (path === `/git/ref/heads/${STATE_BRANCH}`) return branch ? Response.json({ object: { sha: "a".repeat(40) } }) : Response.json({}, { status: 404 });
  if (method === "POST" && path === "/git/refs" && body.ref === `refs/heads/${STATE_BRANCH}`) { branch = true; return Response.json({}); }
  if (!path.startsWith("/contents/jobs/")) return null;
  const name = path.split("?")[0];
  assert.match(name, /^\/contents\/jobs\/[a-f0-9]{64}\.json$/);
  if (method === "GET") return files.has(name) ? Response.json(files.get(name)) : Response.json({}, { status: 404 });
  assert.equal(method, "PUT");
  assert.equal(body.branch, STATE_BRANCH);
  assert.equal(body.sha, files.get(name)?.sha);
  const file = { sha: String(Number(files.get(name)?.sha || 0) + 1), content: body.content, encoding: "base64", size: Buffer.byteLength(body.content, "base64") };
  files.set(name, file);
  return Response.json(file);
}
