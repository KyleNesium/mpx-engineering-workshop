# JobMatch Lab - agent guidance

## Project purpose

- This repository is a local workshop application with fictional companies, jobs, and candidates.
- It models a jobs marketplace without using Ringier, JobCloud, or real applicant data.
- Keep the app runnable with `npm start` and the demo API deterministic.
- Preserve the deliberate workshop baseline until the corresponding issue is being solved.
- In Task 0, read `workshop/issues/issue.md` and `workshop/issues/bug.md` to create the two exercise issues through the participant's connected GitHub integration. Follow the setup prompt in `WORKBOOK.md`: target only the participant's fork identified by `origin`, check open and closed issues for duplicates, preserve the template markers, and verify the resulting issues by reading them back.
- For Tasks 1-3, read ISSUE-001 and BUG-001 from that fork on GitHub. The Markdown files seed the issues; the GitHub issues are the exercise requirements after setup. Do not implement either issue during Task 0.
- The marked setup issues are reserved for the participant's local exercises. Keep them out of the later automated refinement flow; Tasks 8-9 use separate issues.

## Workshop setup rules

- Identify the participant fork with `git remote get-url origin`. Stop before writing if it is `openai-codex-demo/JobMatch-Lab` or `RingierIMU/mpx-engineering-workshop`, the account/repository is ambiguous, or the connected GitHub integration lacks access. Do not switch accounts or repositories silently.
- Seed the two exercise issues from `workshop/issues/issue.md` and `workshop/issues/bug.md`: first Markdown heading as title, remaining Markdown verbatim as body, including its hidden marker.
- Check all open and closed issues for each marker or exact title before creating missing issues; a search index alone does not prove absence. Reuse one unambiguous match without editing or reopening. Stop on multiple matches. Apply no automation labels.
- Read back the resulting repository, titles, and complete bodies. Return URLs, actual GitHub numbers, created/reused state, and any differences or closed state. Do not overwrite differences or claim creation without readback.
- Start or reuse the preview on 4175 only when it serves this checkout. Stop on a conflicting checkout/application. Setup must not implement exercises, modify source, create PRs, configure later services, or read the prepared P1 write-up.

## Code Review Rules

### Matching behavior

- Match scores must be explainable from the returned skill breakdown and location component.
- A broader or related skill must never be presented as an exact match.
- Changes to scoring need examples for an exact match, a related match, and a missing skill.
- For INC-002, investigate the incident page first. Preserve match integrity across request orders, and keep the fix separate from ISSUE-001's scoring rules.

### Catalog identity

- `canonicalId` identifies the same job across direct and partner feeds.
- Job lists and counts should represent unique roles after BUG-001 is fixed.
- Keep filtering and stable ordering when deduplicating.

### Applicant data boundary

- Public job discovery and candidate summary routes should never return email, phone, or private recruiter notes.
- Detailed applicant records and bulk exports are recruiter-only surfaces.
- Report concrete authorization regressions and sensitive-data exposures.

### Lint and CI evidence

- Read `eslint.config.js` and available CI diagnostics when assessing changed code. Explain relevant failures and propose a scoped correction when requested.
- `JobMatch Lab checks` runs `npm run check`: lint, tests, and build. Report each actual result separately from the code review.
- Preserve the configured React, Hooks, and accessibility checks. Do not weaken lint rules to hide a failure. Keep mechanical lint checks in CI rather than replacing them with review comments.
- Native GitHub review and participant-led reviews follow these rules. Keep diagnosis, review findings, and proposed corrections separate from a later requested implementation.

## Verification

- `npm run lint`
- `npm test`
- `npm run build`
- Use one preview server on `127.0.0.1:4175`. Stop it before starting the app from another checkout; do not run concurrent workshop preview servers.
- Do not describe a Codex Security Cloud finding as validated until its scan has completed and the finding has been inspected.
