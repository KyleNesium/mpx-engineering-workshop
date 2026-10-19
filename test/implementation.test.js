import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { approvedEvent, approvalSnapshot, allowedImplementationPath, checkPatch, checkManifest, issueRevision, publishPR, exec } from "../scripts/implementation-core.js";

const issue = () => ({ number: 1, title: "Remote-only filter", body: "Approved requirements.", state: "open", labels: [{ name: "factory-ready" }, { name: "ready-for-implementation" }] });

async function repository() {
  const cwd = await mkdtemp(join(tmpdir(), "jobmatch-implementation-"));
  await mkdir(join(cwd, "src"));
  await writeFile(join(cwd, "src/app.js"), "export const theme = 'light';\n");
  await exec("git", ["init", "-q"], { cwd });
  await exec("git", ["add", "."], { cwd });
  await exec("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "baseline"], { cwd });
  const base = (await exec("git", ["rev-parse", "HEAD"], { cwd })).stdout.trim();
  return { cwd, base };
}

test("implementation starts only for the explicit human approval label", () => {
  const event = { action: "labeled", label: { name: "factory-ready" }, issue: issue(), sender: { type: "User" } };
  assert.equal(approvedEvent(event), true);
  assert.equal(approvedEvent({ ...event, label: { name: "ready-for-implementation" } }), false);
  assert.equal(approvedEvent({ ...event, sender: { type: "Bot" } }), false);
  assert.equal(approvedEvent({ ...event, issue: { ...issue(), pull_request: {} } }), false);
  assert.equal(approvedEvent({ ...event, issue: { ...issue(), state: "closed" } }), false);
});

test("readiness and approval are both required; bot comments do not invalidate approval", async () => {
  let current = issue();
  const github = async (method, path) => path.includes("comments?") ? [] : current;
  assert.ok((await approvalSnapshot(github, 1)).revision);
  current = { ...current, labels: [...current.labels, { name: "needs-info" }] };
  await assert.rejects(approvalSnapshot(github, 1), /Review a ready/);
  assert.equal(issueRevision(issue(), []), issueRevision(issue(), [{ user: { type: "Bot" }, body: "Bot note" }]));
  assert.notEqual(issueRevision(issue(), []), issueRevision(issue(), [{ id: 1, user: { type: "User", login: "author" }, body: "Changed scope" }]));
});

test("patch gate accepts app changes and rejects automation paths, traversal and symlinks", async () => {
  const { cwd } = await repository();
  try {
    await writeFile(join(cwd, "src/app.js"), "export const theme = 'dark';\n");
    const patch = (await exec("git", ["diff", "--binary", "HEAD"], { cwd })).stdout;
    await exec("git", ["checkout", "--", "src/app.js"], { cwd });
    const path = join(cwd, "candidate.patch");
    await writeFile(path, patch);
    assert.deepEqual(await checkPatch(path, cwd), ["src/app.js"]);
    for (const name of ["scripts/triage-core.js", ".github/workflows/test.yml", "test/fixtures/mock.js", "test/implementation.test.js", "src/../scripts/escape.js", "package.json"]) assert.equal(allowedImplementationPath(name), false, name);
    await writeFile(path, patch.replaceAll("src/app.js", "scripts/app.js"));
    await assert.rejects(checkPatch(path, cwd), /protected/);
    await writeFile(path, "diff --git a/src/link.js b/src/link.js\nnew file mode 120000\n");
    await assert.rejects(checkPatch(path, cwd), /symlinks/);
  } finally { await rm(cwd, { recursive: true }); }
});

test("publisher rechecks approval and creates one PR ready for review from the staged patch", async () => {
  const { cwd, base } = await repository();
  try {
    await writeFile(join(cwd, "src/app.js"), "export const theme = 'dark';\n");
    await exec("git", ["add", "src/app.js"], { cwd });
    let current = issue();
    let currentBase = base;
    const writes = [];
    let previous = null;
    const github = async (method, path, body) => {
      if (method === "POST") {
        writes.push({ path, body });
        if (path === "/pulls") { previous = { html_url: "https://github.com/example/demo/pull/1", ...body }; return previous; }
        return { sha: "b".repeat(40) };
      }
      if (path.startsWith("/pulls?")) return previous ? [previous] : [];
      if (path.includes("comments?")) return [];
      if (path.startsWith("/issues/")) return current;
      if (path.startsWith("/git/ref/")) return { object: { sha: currentBase } };
      if (path.startsWith("/git/commits/")) return { tree: { sha: "c".repeat(40) } };
      throw new Error(`Unexpected ${path}`);
    };
    const metadata = { repository: "example/demo", issue_number: 1, base_sha: base, issue_revision: issueRevision(current, []), agent_id: "agent_test", session_id: "sess_test", turn_id: "turn_test" };
    const args = { github, repository: "example/demo", number: 1, baseBranch: "main", metadata, manifest: { status: "implemented", summary: "Changed application code.", blockers: [] }, cwd };
    current = { ...current, body: "New requirement." };
    await assert.rejects(publishPR(args), /Issue changed/);
    assert.equal(writes.length, 0);
    current = issue(); currentBase = "a".repeat(40);
    await assert.rejects(publishPR(args), /Default branch changed/);
    currentBase = base;
    const pr = await publishPR(args);
    assert.equal(pr.draft, false);
    assert.equal(pr.head, "factory/issue-1");
    assert.match(pr.body, /Closes #1/);
    assert.match(pr.body, /npm run check/);
    const count = writes.length;
    assert.equal((await publishPR(args)).html_url, pr.html_url);
    assert.equal(writes.length, count);
    previous = { ...previous, draft: true };
    assert.equal((await publishPR(args)).draft, true);
    assert.equal(writes.length, count, "An existing draft is reused for the participant's GitHub Ready for review step.");
    assert.equal(writes.some(w => w.path.includes("merge")), false);
  } finally { await rm(cwd, { recursive: true }); }
});

test("blocked agent results cannot enter validation or publication", () => {
  assert.throws(() => checkManifest({ status: "blocked", summary: "Missing requirements.", blockers: ["Clarify scope"] }), /incomplete/);
  assert.throws(() => checkManifest({ status: "implemented", summary: "Done", blockers: ["Tests failed"] }), /blocked/);
});
