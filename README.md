# JobMatch Lab

JobMatch Lab is a local jobs marketplace prototype for the Ringier Engineering workshop. It is based on the architecture of Connect-Pilot-Demo: a React interface, one local Node.js server, Vite development middleware, deterministic seed data, built-in tests, and a Codex worktree configuration.

All companies, job posts, candidate identities, contact details, and recruiter notes are fictional. The application does not connect to Ringier, JobCloud, or a production hiring system.

## Run it

Requires Node.js 20.19+ within version 20, or Node.js 22.12+, and npm.

```bash
npm ci
npm start
```

Open [http://127.0.0.1:4175](http://127.0.0.1:4175). The API is served by the same process. Check readiness with `curl -fsS http://127.0.0.1:4175/api/health`.

## Open the workshop

Access the workshop directly at [JobMatch Lab Workshop](https://jobmatch-lab-workshop.openai.chatgpt.site/).

The workshop-only diagnostic pages and their direct links are in [WORKBOOK.md](WORKBOOK.md). Restart the Node server after a server-side fix, then refresh the relevant page.

Use one local preview on **4175**. Stop the current server before running `npm start` in a different checkout or worktree. To verify the project, run `npm run check`. The check runs lint, tests, and a production frontend build. `npm run serve` serves the built `dist/` directory.

## Workshop issue setup

After forking and completing the preparation in [WORKBOOK.md](WORKBOOK.md#before-you-begin), connect your GitHub account in Codex and use the **Task 0 setup prompt**. Codex reads [issue.md](workshop/issues/issue.md) and [bug.md](workshop/issues/bug.md), creates missing issues in your fork, and returns their verified links. No setup script or GitHub CLI is required. Inspect both issues yourself before continuing; Tasks 1-3 use their GitHub descriptions as requirements.

The template markers identify these local workshop exercises and exclude them from automated issue refinement in Tasks 8-9. Keep the markers when creating the issues. Repeating the setup prompt reuses existing issues without reopening or overwriting them.

## Explore the application

- **Overview:** fictional listing and candidate metrics plus ranked job matches.
- **Explore jobs:** searchable roles from direct and partner feeds.
- **Candidates:** selectable public candidate summaries.
- **Workshop lab:** the three stages of the engineering exercise.
- **Match insights:** exact skill matches, location fit, and an explainable score.

The visible catalog intentionally includes one duplicate role. The matching engine intentionally supports only exact skill matches. These are independent tasks designed for parallel Codex worktrees.

The P1 incident is a separate match-integrity exercise. Start from its diagnostic page and investigate the observed behavior before reading the incident write-up. Keep the fix separate from ISSUE-001's scoring changes and the later access-control exercise.

## Key files

| Path | Role |
| --- | --- |
| `server.js` | Local HTTP server, API routes, and Vite integration |
| `server/seed-data.js` | Fictional jobs and candidate records |
| `server/catalog.js` | Listing ingestion and filtering, including the seeded duplicate |
| `server/matching.js` | Exact-only matching baseline |
| `server/recommendations.js` | Recommendation request handling |
| `server/skills.js` | Example skill hierarchy for ISSUE-001 |
| `server/candidates.js` | Public summaries and full candidate records |
| `src/App.jsx` | React marketplace and match-insights interface |
| `test/` | Baseline unit and API tests |
| `workshop/issues/issue.md`, `workshop/issues/bug.md` | Templates for the two GitHub issues created by the Task 0 prompt |
| `.github/workflows/issue-implementation.yml` | Approved-issue implementation and PR ready for review workflow |
| `workshop/agents/issue-implementation.md` | Implementation agent instructions |
| `WORKBOOK.md` | Participant guide, issue-setup prompt, and refinement instructions |
| `.agents/skills/` | One evidence-first incident-investigation skill for Task 3A |
| `.codex/environments/environment.toml` | Codex worktree setup and quick actions |
| `AGENTS.md` | Repository and code-review guidance |

## API

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Readiness |
| `GET /api/overview` | Catalog and candidate counts |
| `GET /api/jobs` | Listings; supports `q`, `category`, and `location` |
| `GET /api/jobs/:id` | One job listing |
| `GET /api/candidates` | Public candidate summaries |
| `GET /api/matches?candidateId=...` | Ranked roles and score breakdown |
| `GET /api/candidates/:id` | Full candidate record; workshop security baseline |
| `GET /api/admin/candidates/export` | Candidate export; workshop security baseline |

## Boundaries

This is a training application. It does not include real user authentication, actual hiring decisions, or production data. The seeded security defects are confined to synthetic data and must be addressed before adapting any part of the application for a real environment. The default server bind is local-only.
