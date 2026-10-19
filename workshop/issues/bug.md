# BUG-001 - Deduplicate syndicated job listings

<!-- jobmatch-workshop:BUG-001 -->

The Senior Product Engineer role is present once in the direct feed and once in the partner feed. The UI shows both because `server/catalog.js` concatenates the sources without reconciling their shared `canonicalId`.

Open `http://127.0.0.1:4175/incident` before changing the code. The page reads the live API response and shows both source records. Refresh it after the fix to verify the incident resolves.

## Acceptance criteria

- Show one listing per `canonicalId`.
- Prefer the direct listing when the same role exists in both feeds.
- Preserve the existing query, category, and location filters.
- Update the catalog count and add a regression test for the duplicate.

## Scope

Work mainly in `server/catalog.js` and its tests. Do not change the match-scoring logic for ISSUE-001.
