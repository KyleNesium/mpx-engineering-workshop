---
name: jobmatch-incident-investigation
description: Investigate the JobMatch Lab P1 incident from its diagnostic page and logs, then implement and verify a scoped fix when requested in Workbook Task 3A.
---

# JobMatch Lab incident investigation

Start from the supplied incident URL, normally `http://127.0.0.1:4175/incident/match-isolation`. Read `AGENTS.md` and Task 3A in `WORKBOOK.md`. Treat the page and logs as the initial report; do not open the prepared P1 write-up or assume a root cause before tracing the failure.

- Confirm the checkout, branch, and which checkout serves the preview. Keep one server on 4175; stop the current demo process before starting another checkout. Do not stop unrelated processes.
- Reproduce the sequence and capture requests, profile identities, ordering, and returned match results. Trace the behavior through the application and explain the supported diagnosis before editing.
- When a fix is requested, change the smallest justified area. Preserve unrelated scoring, the duplicate fix, and the intentional security baseline unless the issue targets them.
- Add a regression test for the failed sequence and reverse request order. Run `npm run check`, restart from the fixed checkout, and refresh the incident evidence.
- Report symptoms, cause, changed files, actual checks, and refreshed incident status. Passing tests alone do not establish live incident resolution. Do not merge as part of this skill.
