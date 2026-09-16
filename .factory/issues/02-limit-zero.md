---
id: "2"
route: bug
title: A limit of zero is refused instead of returning nothing
paths:
  - services/ingest/http.go
  - services/ingest/http_test.go
doneWhen: GET /runs?limit=0 answers 200 with an empty list, and a test covers it.
---

`GET /runs?limit=0` answers 400 with `bad_limit`. Asking for no rows is a reasonable thing for a
paginating client to do while it works out how many it wants, and the answer should be an empty
list rather than an error.

Anything above 200 should still be refused, and a negative limit should still be refused.

Acceptance criteria:

- `limit=0` returns 200 and an empty array.
- `limit=-1` and `limit=100000` still return 400 with a machine-readable code.
- A test covers the zero case and fails without the change.
