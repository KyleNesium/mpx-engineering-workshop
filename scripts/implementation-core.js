import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

export const exec = promisify(execFile);
export const FACTORY_LABEL = "factory-ready";
export const branchFor = number => `factory/issue-${number}`;
export const digest = value => createHash("sha256").update(value).digest("hex");

export function approvedEvent(event) {
  return event.action === "labeled" && event.label?.name === FACTORY_LABEL &&
    event.issue?.state === "open" && !event.issue.pull_request && event.sender?.type !== "Bot";
}

export function issueRevision(issue, comments) {
  return digest(JSON.stringify({ title: issue.title, body: issue.body || "", comments: comments
    .filter(c => c.user?.type !== "Bot").map(c => ({ id: c.id, author: c.user.login, body: c.body })) }));
}

export async function approvalSnapshot(github, number) {
  const issue = await github("GET", `/issues/${number}`);
  const labels = issue.labels.map(l => l.name);
  if (issue.state !== "open" || issue.pull_request || !labels.includes(FACTORY_LABEL) ||
      !labels.includes("ready-for-implementation") || labels.includes("needs-info")) {
    throw new Error("Review a ready-for-implementation issue and apply factory-ready before implementation.");
  }
  const comments = [];
  for (let page = 1; page <= 20; page++) {
    const batch = await github("GET", `/issues/${number}/comments?per_page=100&page=${page}`);
    comments.push(...batch);
    if (batch.length < 100) return { issue, comments, revision: issueRevision(issue, comments) };
  }
  throw new Error("Too many comments to read the complete approved request.");
}

export async function existingPR(github, owner, number) {
  const items = await github("GET", `/pulls?state=all&head=${encodeURIComponent(`${owner}:${branchFor(number)}`)}&per_page=100`);
  return items[0] || null;
}

export function allowedImplementationPath(path) {
  if (["server.js", "index.html"].includes(path)) return true;
  if (!/^(src|server|test)\/[A-Za-z0-9_./-]+\.(js|jsx|css|json|html)$/.test(path)) return false;
  if (path.split("/").some(p => p === "." || p === ".." || p.startsWith("."))) return false;
  return !path.startsWith("test/fixtures/") && !/^test\/(triage|implementation|automation-state)[^/]*\.test\.js$/.test(path);
}

export async function checkPatch(path, cwd = process.cwd()) {
  const patch = await readFile(path);
  if (!patch.length || patch.length > 500000) throw new Error("Missing or oversized implementation patch.");
  const text = patch.toString("utf8");
  if (/GIT binary patch|^Binary files /m.test(text) || /^(new file mode|deleted file mode|old mode|new mode) (?!100644$)\d+/m.test(text)) {
    throw new Error("Binary files, symlinks, and executable mode changes are outside this exercise.");
  }
  const { stdout } = await exec("git", ["apply", "--numstat", "-z", path], { cwd });
  const records = stdout.split("\0").filter(Boolean);
  if (!records.length || records.length > 30) throw new Error("Invalid patch file count.");
  const paths = records.map(line => {
    const fields = line.split("\t");
    if (fields.length !== 3 || !/^\d+$/.test(fields[0]) || !/^\d+$/.test(fields[1]) || !allowedImplementationPath(fields[2])) {
      throw new Error("Patch changes a protected or unsupported path.");
    }
    return fields[2];
  });
  await exec("git", ["apply", "--check", "--index", path], { cwd });
  return paths;
}

export function checkManifest(manifest) {
  if (!manifest || manifest.status !== "implemented" || typeof manifest.summary !== "string" || manifest.summary.length > 3000 ||
      !Array.isArray(manifest.blockers) || manifest.blockers.length) throw new Error("Agent reported an incomplete or blocked implementation.");
}

export function checkMetadata(metadata, repository, number) {
  if (metadata.repository !== repository || metadata.issue_number !== number ||
      !/^[a-f0-9]{40}$/.test(metadata.base_sha) || !/^[a-f0-9]{64}$/.test(metadata.issue_revision) ||
      !/^agent_[-\w]+$/.test(metadata.agent_id) || !/^[-\w]+$/.test(metadata.session_id) || !/^[-\w]+$/.test(metadata.turn_id)) {
    throw new Error("Implementation artifact does not match this workflow request.");
  }
}

// Publish only staged source files, without executing agent-generated code or
// placing GitHub credentials in the agent's sandbox or the Git working tree.
export async function publishPR({ github, repository, number, baseBranch, metadata, manifest, cwd }) {
  checkMetadata(metadata, repository, number);
  checkManifest(manifest);
  const owner = repository.split("/")[0];
  const prior = await existingPR(github, owner, number);
  if (prior) return prior;
  const snapshot = await approvalSnapshot(github, number);
  if (snapshot.revision !== metadata.issue_revision) throw new Error("Issue changed since approval. Review it and reapply factory-ready.");
  const head = await github("GET", `/git/ref/heads/${encodeURIComponent(baseBranch)}`);
  if (head.object.sha !== metadata.base_sha) throw new Error("Default branch changed. Reapply factory-ready to regenerate against the latest code.");
  const commit = await github("GET", `/git/commits/${metadata.base_sha}`);
  const { stdout } = await exec("git", ["diff", "--cached", "--name-status", "-z"], { cwd });
  const entries = stdout.split("\0").filter(Boolean);
  const tree = [];
  for (let i = 0; i < entries.length; i += 2) {
    const status = entries[i], path = entries[i + 1];
    if (!["A", "M", "D"].includes(status) || !path || !allowedImplementationPath(path)) throw new Error("Unsupported staged change.");
    if (status === "D") { tree.push({ path, mode: "100644", type: "blob", sha: null }); continue; }
    const { stdout: content } = await exec("git", ["show", `:${path}`], { cwd, encoding: "buffer", maxBuffer: 2000000 });
    const blob = await github("POST", "/git/blobs", { content: content.toString("base64"), encoding: "base64" });
    tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
  }
  if (!tree.length) throw new Error("No implementation changes to publish.");
  const createdTree = await github("POST", "/git/trees", { base_tree: commit.tree.sha, tree });
  const createdCommit = await github("POST", "/git/commits", { message: `Implement issue #${number} with Agents API`, tree: createdTree.sha, parents: [metadata.base_sha] });
  const branch = branchFor(number);
  // Create, never force-update: an existing branch is kept for human inspection.
  await github("POST", "/git/refs", { ref: `refs/heads/${branch}`, sha: createdCommit.sha });
  return github("POST", "/pulls", {
    title: `Implement issue #${number}: ${snapshot.issue.title.slice(0, 150)}`, base: baseBranch, head: branch, draft: false,
    body: `Closes #${number}\n\n${manifest.summary}\n\n### Validation\n\n- Runner: \`npm run check\` passed (lint, tests, build).\n- Base commit: \`${metadata.base_sha}\`\n- Agent: \`${metadata.agent_id}\`\n- Session: \`${metadata.session_id}\`\n\nReview the implementation, CI checks, and Codex review before merging.`,
  });
}
