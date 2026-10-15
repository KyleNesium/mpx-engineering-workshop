---
name: jobmatch-code-review
description: Review JobMatch Lab diffs and PRs against workshop requirements and lint or CI evidence, or guide review setup in Workbook Task 6. Use in Tasks 4, 6, and 8.
---

# JobMatch Lab code review

Read `AGENTS.md`, the relevant Workbook task, and the target diff. Establish the branch or PR head and completed exercises. Deliberate baseline defects are not new regressions unless this change is intended to fix them.

## Application review

- For matching changes, inspect exact versus related credit, explanations, location fit, deterministic scores, and profile isolation in both request orders.
- For catalog changes, inspect canonical identity, direct-source preference, stable ordering, preserved filters, and displayed counts.
- For the remote filter, verify exact `workMode: "Remote"`, composition with search and category, off behavior, and UI counts. Preserve unrelated exercises.
- For applicant access changes, follow public-summary versus recruiter-only boundaries. Raise concrete regressions supported by the diff and intended behavior; do not expand ordinary review into a repository-wide security scan.

## Lint and checks

Inspect `eslint.config.js` and `.github/workflows/ci.yml`. `npm run check` runs lint, tests, and build. Inspect available PR check results and failure diagnostics at the current head. For local review, run relevant checks when dependencies and execution access are available; otherwise state what was not run.

Explain lint failures and their location. Propose a scoped correction, or implement it when requested. Preserve React, Hooks, and accessibility checks; do not suppress rules to conceal a defect. CI success and a completed review are separate evidence. Do not report checks as passed from a prior head, pending run, or generated summary.

For setup requests, follow Task 6 and current official Codex documentation. Verify the repository and saved triggers. Native GitHub Code Review reads `AGENTS.md`; it does not automatically invoke this local skill.

Return concrete findings with file locations, impact, and evidence, plus lint/test/build and review statuses. If there are no supported findings, say so and identify verification gaps. Do not post reviews, approve PRs, or merge unless the user authorizes those actions.
