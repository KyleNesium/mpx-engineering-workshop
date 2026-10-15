# ISSUE-001 - Recognize related skills in match scores

The current match engine recognizes exact text matches only. It misses useful relationships such as React being a more specific frontend-development skill. The small example hierarchy in `server/skills.js` is available but unused.

## Acceptance criteria

- Preserve exact matches and their score.
- Give a smaller, explainable contribution when a candidate skill relates to a required skill through the example hierarchy.
- The skill breakdown distinguishes exact, related, and missing matches.
- Scoring remains deterministic and within 0-100.
- Add focused tests for an exact match, a related match, an unrelated skill, and a remote role.

## Scope

Work mainly in `server/matching.js` and its tests. Keep the dataset synthetic. Do not change the catalog ingestion logic for BUG-001.
