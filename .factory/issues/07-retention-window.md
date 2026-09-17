---
id: "7"
route: plan-revision
title: Keep runs for longer than the console can show
paths:
  - services/ingest/store.go
  - apps/console/app/page.tsx
doneWhen: The plan a person accepted is the plan that was built, and the pull request matches it rather than the first draft.
---

The console lists the most recent runs and there is no way to look further back. A month-end review
needs more than the last page, and right now the only answer is to query the service directly.

Give the reader a way to see older runs.

Acceptance criteria:

- The reader can reach runs beyond the first page.
- The ingest service stays the one place that decides what a run is.
- Nothing is deleted or expired as part of this change.
