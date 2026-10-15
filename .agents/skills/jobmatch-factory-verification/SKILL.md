---
name: jobmatch-factory-verification
description: Verify JobMatch Lab refinement and approved-issue implementation using actual issue, workflow, check, and draft PR evidence in Workbook Tasks 7 and 8.
---

# JobMatch Lab software factory verification

Read Tasks 7-8 in `WORKBOOK.md` and the included workflows. Verify the supplied repository, issue or PR, and current revision. Start with read-only evidence; setup, issue creation, labels, reruns, and publication require an authorized task, not just a status request.

## Refinement

- Check that the workflow and marked Task 7.A prompt exist on the default branch. Confirm configured agent/variable names and secret presence without reading or displaying secret values.
- Inspect the original description, specification, human answers, questions comment, and label. `needs-info` calls for answers to blocking questions; `ready-for-implementation` means completeness, not coding approval.
- Inspect the job/session checkpoints on `jobmatch-agent-state` before retries. Uncertain outcomes require reconciliation; do not delete reservations or automatically replay paid sessions.
- Verify the new-issue or human-comment run completed and its write was read back. A saved agent or started session is not a verified GitHub update.

## Implementation

- Confirm a human with repository write access applied `factory-ready` to the reviewed issue. Inspect `generate_patch`, `validate_patch`, and `open_draft_pr` in its implementation run.
- Verify the PR links to the issue, is a draft, targets the expected default branch, and contains intended source and tests. Identify existing factory PRs before retries; do not create duplicates or overwrite branches.
- Check lint/test/build at the PR head. Runner validation, PR CI, and Codex review have separate statuses. Inspect automatic review only when part of the current task; report it as not tested if excluded or unavailable.
- Report links and verified issue, approval, run, checks, and PR states, plus pending or failed steps. Do not merge or imply that a draft PR is approved.

The refinement agent returns structured JSON and the runner validates and publishes it; the implementation agent uses a sandbox without GitHub credentials; a separate job publishes its validated patch. These Agents API runners do not automatically load this local skill.
