import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("runner skips both prepared exercises without credentials or API requests", () => {
  const directory = mkdtempSync(join(tmpdir(), "jobmatch-workshop-skip-"));
  try {
    for (const file of ["issue.md", "bug.md"]) {
      const body = readFileSync(new URL(`../workshop/issues/${file}`, import.meta.url), "utf8");
      const eventPath = join(directory, "event.json");
      writeFileSync(eventPath, JSON.stringify({ action: "opened", issue: { number: 1, state: "open", body } }));
      const result = spawnSync(process.execPath, ["scripts/triage-issue.js"], {
        cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: 10000,
        env: { GITHUB_EVENT_PATH: eventPath, GITHUB_EVENT_NAME: "issues" },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Triage skipped/);
      assert.doesNotMatch(result.stdout, /Triage session:/);
    }
  } finally { rmSync(directory, { recursive: true }); }
});

test("runner creates a streamed session with input and publishes validated JSON without agent tool calls", () => {
  const directory = mkdtempSync(join(tmpdir(), "jobmatch-triage-test-"));
  try {
    const eventPath = join(directory, "event.json");
    writeFileSync(eventPath, JSON.stringify({ action: "opened", issue: { number: 1, state: "open" } }));
    const result = spawnSync(process.execPath, ["--import", "./test/fixtures/agents-api.js", "scripts/triage-issue.js"], {
      cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: 10000,
      env: { ...process.env, GITHUB_EVENT_PATH: eventPath, GITHUB_EVENT_NAME: "issues", GITHUB_REPOSITORY: "example/demo", TRIAGE_AGENT_ID: "agent_test", OPENAI_API_KEY: "test-only-openai", GITHUB_TOKEN: "test-only-github", GITHUB_STEP_SUMMARY: "" },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Triage session: session_test/);
    assert.match(result.stdout, /GitHub readback passed/);
  } finally { rmSync(directory, { recursive: true }); }
});

for (const scenario of ["invalid", "stale"]) {
  test(`runner refuses ${scenario} refinement output`, () => {
    const directory = mkdtempSync(join(tmpdir(), "jobmatch-triage-failure-"));
    try {
      const eventPath = join(directory, "event.json");
      writeFileSync(eventPath, JSON.stringify({ action: "opened", issue: { number: 1, state: "open" } }));
      const result = spawnSync(process.execPath, ["--import", "./test/fixtures/agents-api.js", "scripts/triage-issue.js"], {
        cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: 10000,
        env: { ...process.env, FIXTURE_CASE: scenario, GITHUB_EVENT_PATH: eventPath, GITHUB_EVENT_NAME: "issues", GITHUB_REPOSITORY: "example/demo", TRIAGE_AGENT_ID: "agent_test", OPENAI_API_KEY: "test-only-openai", GITHUB_TOKEN: "test-only-github", GITHUB_STEP_SUMMARY: "" },
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, scenario === "invalid" ? /Invalid specification fields/ : /Issue or answers changed/);
      assert.doesNotMatch(result.stdout, /GitHub readback passed/);
    } finally { rmSync(directory, { recursive: true }); }
  });
}

for (const scenario of ["auth", "unsafe-error"]) {
  test(`runner reports ${scenario} API failure without echoing credentials`, () => {
    const directory = mkdtempSync(join(tmpdir(), "jobmatch-triage-auth-"));
    try {
      const eventPath = join(directory, "event.json");
      writeFileSync(eventPath, JSON.stringify({ action: "opened", issue: { number: 1, state: "open" } }));
      const result = spawnSync(process.execPath, ["--import", "./test/fixtures/agents-api.js", "scripts/triage-issue.js"], {
        cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: 10000,
        env: { ...process.env, FIXTURE_CASE: scenario, GITHUB_EVENT_PATH: eventPath, GITHUB_EVENT_NAME: "issues", GITHUB_REPOSITORY: "example/demo", TRIAGE_AGENT_ID: "agent_test", OPENAI_API_KEY: "test-only-openai", GITHUB_TOKEN: "test-only-github", GITHUB_STEP_SUMMARY: "" },
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Agents API POST failed \(401/);
      assert.match(result.stderr, /invalid_request_error/);
      if (scenario === "auth") assert.match(result.stderr, /invalid_api_key/);
      assert.doesNotMatch(result.stdout + result.stderr, /test-only-openai|Incorrect API key provided|Do not print this message/);
      assert.doesNotMatch(result.stdout, /Triage session:|GitHub readback passed/);
    } finally { rmSync(directory, { recursive: true }); }
  });
}
