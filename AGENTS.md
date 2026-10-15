# JobMatch Lab - agent guidance

## Project purpose

- This repository is a local workshop application with fictional companies, jobs, and candidates.
- It models a jobs marketplace without using Ringier, JobCloud, or real applicant data.
- Keep the app runnable with `npm start` and the demo API deterministic.
- Preserve the deliberate workshop baseline until the corresponding issue is being solved.
- Read the ISSUE-001 and BUG-001 exercise briefs in WORKBOOK.md; no separate issue page is required.

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
- Native GitHub review follows these rules; participant-led reviews can also use `.agents/skills/jobmatch-code-review/SKILL.md`.

## Verification

- `npm run lint`
- `npm test`
- `npm run build`
- Use one preview server on `127.0.0.1:4175`. Stop it before starting the app from another checkout; do not run concurrent workshop preview servers.
- Do not describe a Codex Security Cloud finding as validated until its scan has completed and the finding has been inspected.
