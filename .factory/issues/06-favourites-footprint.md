---
id: "6"
route: review-rejection
title: Review the pull request that adds a saved view to the console
paths:
  - apps/console/lib/views.ts
  - apps/console/lib/ledger.test.ts
doneWhen: The review names what the change does that the issue never asked for, and the pull request is fixed before it merges.
---

A pull request is open that lets a reader save the filter they are looking at, so they do not have
to set it again next time.

Read it against what was asked for. The change should store the filter and nothing else, and it
should not alter any test that already existed.
