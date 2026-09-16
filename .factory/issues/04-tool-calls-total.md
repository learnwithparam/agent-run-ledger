---
id: "4"
route: cross-stack
title: Record how many tool calls a whole run made
paths:
  - packages/contracts/schema/run.schema.json
  - packages/contracts/src/index.ts
  - services/ingest/run.go
  - apps/console/app/page.tsx
doneWhen: The schema declares the field, every language asserts it against the schema, and all three suites pass together.
---

Stages carry a tool call count and a run does not, so the console adds them up itself. When a stage
is missing the total silently disagrees with the ledger, and nobody can tell which number is wrong.

Put the total on the run, where the service that owns runs can compute it.

Acceptance criteria:

- `toolCalls` is a required integer on the run schema.
- The TypeScript type, its field list, and the Go struct tags all match the schema.
- `bun test` in `packages/contracts`, `go test ./...` in `services/ingest` and `cargo test` in
  `services/budget` all pass.
