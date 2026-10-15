# INC-002 - Cross-profile recommendations after switching candidates

**Severity:** P1 in the fictional marketplace. A candidate can receive job scores computed for someone else. This can mislead job discovery and erode trust in recommendations. No real applicant data or hiring decision is involved.

## Reproduction

1. Open `http://127.0.0.1:4175/incident/match-isolation`.
2. Compare Maya and Noah. The API response identifies both the requested `candidateId` and `scoredForCandidateId`.
3. One response is scored for the wrong profile. Switching candidates in the marketplace can leave the same ranking on screen.

## Acceptance criteria

- Every `/api/matches?candidateId=...` response uses that candidate's own skills and location.
- Results do not depend on request order or another candidate's earlier request.
- Any cache key includes candidate identity and a safe catalog version, or the cache is removed for this small demo.
- Preserve ISSUE-001's exact and related-skill scoring and BUG-001's catalog behavior.
- Add regression tests for requests in both profile orders. Update the seeded baseline test that asserts cross-profile reuse.
- Restart the Node server after the fix and refresh the incident page. It must show zero misattributed responses and `VERIFIED RESOLVED`.

## Scope

Start with `server/recommendations.js`, the `/api/matches` route in `server.js`, and `test/recommendations.test.js`. Keep this hotfix in the incident worktree, separate from the Local matching feature task.
