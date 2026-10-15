import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "../scripts/implementation-core.js";

async function validationFixture(checkCode) {
  const cwd = await mkdtemp(join(tmpdir(), "jobmatch-agent-validation-"));
  await mkdir(join(cwd, "src"));
  await writeFile(join(cwd, "src/app.js"), "export const implemented = false;\n");
  await writeFile(join(cwd, "package.json"), JSON.stringify({ type: "module", scripts: { check: "node verify.js" } }));
  await writeFile(join(cwd, "verify.js"), checkCode);
  await exec("git", ["init", "-q"], { cwd });
  await exec("git", ["add", "."], { cwd });
  await exec("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "baseline"], { cwd });
  const base = (await exec("git", ["rev-parse", "HEAD"], { cwd })).stdout.trim();
  await writeFile(join(cwd, "src/app.js"), "export const implemented = true;\n");
  const patch = (await exec("git", ["diff", "--binary", "HEAD"], { cwd })).stdout;
  await exec("git", ["checkout", "--", "src/app.js"], { cwd });
  const output = await mkdtemp(join(tmpdir(), "jobmatch-validation-artifacts-"));
  await writeFile(join(output, "implementation.patch"), patch);
  await writeFile(join(output, "approval.json"), JSON.stringify({ repository: "example/demo", issue_number: 1, base_sha: base, issue_revision: "a".repeat(64), agent_id: "agent_test", session_id: "sess_test", turn_id: "turn_test" }));
  await writeFile(join(output, "result.json"), JSON.stringify({ status: "implemented", summary: "Changed app value.", blockers: [] }));
  const eventPath = join(output, "event.json");
  await writeFile(eventPath, JSON.stringify({ action: "labeled", label: { name: "factory-ready" }, issue: { number: 1, state: "open" }, sender: { type: "User", login: "maintainer" } }));
  const env = { ...process.env, GITHUB_EVENT_PATH: eventPath, GITHUB_REPOSITORY: "example/demo", FACTORY_ARTIFACT_DIR: output, OPENAI_API_KEY: "", GITHUB_TOKEN: "", GITHUB_OUTPUT: "", GITHUB_STEP_SUMMARY: "" };
  return { cwd, output, env, cleanup: () => Promise.all([rm(cwd, { recursive: true }), rm(output, { recursive: true })]) };
}

test("validation applies the actual patch and runs checks without publication credentials", async () => {
  const f = await validationFixture("import assert from 'node:assert/strict'; import { implemented } from './src/app.js'; assert.equal(implemented, true); assert.equal(process.env.OPENAI_API_KEY, ''); assert.equal(process.env.GITHUB_TOKEN, '');\n");
  try {
    await exec(process.execPath, [fileURLToPath(new URL("../scripts/implementation-issue.js", import.meta.url)), "validate"], { cwd: f.cwd, timeout: 10000, env: f.env });
    assert.match(await readFile(join(f.cwd, "src/app.js"), "utf8"), /implemented = true/);
  } finally { await f.cleanup(); }
});

test("validation fails if checks alter approval artifacts", async () => {
  const f = await validationFixture("import { writeFileSync } from 'node:fs'; import { join } from 'node:path'; writeFileSync(join(process.env.FACTORY_ARTIFACT_DIR, 'approval.json'), '{}');\n");
  try {
    await assert.rejects(exec(process.execPath, [fileURLToPath(new URL("../scripts/implementation-issue.js", import.meta.url)), "validate"], { cwd: f.cwd, timeout: 10000, env: f.env }), /approval artifacts/);
  } finally { await f.cleanup(); }
});

test("generation runner receives hosted artifacts without exposing GitHub credentials", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "jobmatch-agent-generation-"));
  try {
    await mkdir(join(cwd, "workshop/agents"), { recursive: true });
    await writeFile(join(cwd, "workshop/agents/issue-implementation.md"), "Implement only the approved issue.");
    await exec("git", ["init", "-q"], { cwd });
    await exec("git", ["add", "."], { cwd });
    await exec("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "baseline"], { cwd });
    const eventPath = join(cwd, "event.json");
    await writeFile(eventPath, JSON.stringify({ action: "labeled", label: { name: "factory-ready" }, issue: { number: 1, state: "open" }, sender: { type: "User", login: "maintainer" } }));
    const root = new URL("../", import.meta.url);
    const output = join(cwd, "artifacts");
    await exec(process.execPath, ["--import", fileURLToPath(new URL("test/fixtures/implementation-api.js", root)), fileURLToPath(new URL("scripts/implementation-issue.js", root)), "generate"], {
      cwd, timeout: 10000, env: { ...process.env, GITHUB_EVENT_PATH: eventPath, GITHUB_REPOSITORY: "example/demo", IMPLEMENTATION_AGENT_ID: "agent_implementation_test", OPENAI_API_KEY: "test-only-openai", GITHUB_TOKEN: "test-only-github", FACTORY_ARTIFACT_DIR: output, GITHUB_OUTPUT: "", GITHUB_STEP_SUMMARY: "" },
    });
    const approval = JSON.parse(await readFile(join(output, "approval.json"), "utf8"));
    assert.equal(approval.issue_number, 1);
    assert.equal(approval.session_id, "sess_implementation_test");
    assert.match(await readFile(join(output, "implementation.patch"), "utf8"), /generated = true/);
  } finally { await rm(cwd, { recursive: true }); }
});
