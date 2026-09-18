<!-- mastra-factory-triage -->

|                |                                                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Type**       | feature request — pages beyond the first are not reachable, which is a missing capability not a broken one                                           |
| **Route**      | Await approval                                                                                                                                       |
| **Severity**   | 🟢 low — existing workaround: query the ingest service directly for older runs                                                                         |
| **Confidence** | high — the codebase is small and the gap is directly observable                                                                                      |
| **Effort**     | medium — needs pagination in the Go store/HTTP handler and a navigation UI in the Next.js console, with tests for both                                |
| **Impact**     | low — day-to-day use (latest runs) is unaffected; month-end reviewers are the affected audience and they have a direct-API workaround                 |
| **Next step**  | Maintainer approves or rejects the feature direction so the Factory can produce a plan                                                                |

### Understanding

**What is missing.** The console (`apps/console/app/page.tsx`) calls `listRuns()` → `GET /runs?limit=50` and renders every returned run in one flat table with no way to reach older pages. The ingest service (`services/ingest/http.go` lines 19–36) accepts a `limit` param (default 50, max 200) and truncates the result slice, but has no `offset` or pagination cursor — so there is no way for a caller to fetch the next batch of runs after the first.

**The store.** All runs are held in an in-memory `Store` in `services/ingest/run.go`. The `Runs()` method (line 117) returns every run sorted by `startedAt` descending. Adding an offset parameter is straightforward: skip `offset` entries before slicing to `limit`.

**Previous attempts.** Nine closed, unmerged PRs tried pagination (346, 355, 372, 381, 406, 407, 416, 441, 458). PR 355 took a date-range-filter approach; PRs 372/381 tried offset-based pagination. All were closed without merging. The current issue was reseeded with `Route: plan-revision` to try again with a revised plan.

**Stale file reference.** The issue file lists `services/ingest/store.go` as a target, but no such file exists — the store logic lives in `services/ingest/run.go`. The console target `apps/console/app/page.tsx` is correct.

**Acceptance criteria boundaries.** (1) The reader can reach runs beyond the first page. (2) The ingest service remains the authority on what a run is — the console must not filter or store runs. (3) Nothing is deleted or expired — this is purely about navigation, not retention.

### Assumptions

- The `store.go` path in `.factory/issues/07-retention-window.md` is stale; the store is in `run.go`.
- Previous PRs were closed for substantive approach or quality reasons (not procedural), justifying a fresh attempt with a revised plan.
- The issue is a pure feature — no hidden bug or regression.
- Because the store is in-memory, pagination must be stateless (offset-based, not cursor-based), since restarting the service resets the run order anyway.

### Open questions

None. The codebase is complete and observable; the gap, the approach, and the boundaries are well-defined.

### Reproduction

Not applicable — this is a feature request for a missing capability. To observe the current limitation: start the service with >50 seeded runs, open the console, and note that only the first 50 appear with no controls to reach the rest.