# Keep runs for longer than the console can show — Implementation Plan

## Goal

The console shows only the most recent runs (default 50, max 200). A month-end reviewer who needs to see runs from two weeks ago has no way to reach them. After this plan, the reader can filter the runs list by a date range (`startedAfter` / `startedBefore`) on every layer: the Go store, the HTTP API, the TypeScript client, and the Next.js page. Nothing is deleted or expired. The ingest service remains the single source of truth for what a run is.

## Scope

### In
- Add `startedAfter` / `startedBefore` query params to `GET /runs` (Go HTTP handler)
- Add `RunsInRange(after, before time.Time) []Run` method to the Go Store
- Pass date params from the console client to the API
- Add a date range filter form to the console page
- Tests for the store filter and the HTTP handler

### Out
- No offset/cursor pagination (rejected by maintainer)
- No deletion or expiry of old runs
- No changes to the budget service (unaffected)
- No changes to the shared schema (the API is a view concern, not a contract concern)
- No changes to the `/runs/{id}` or `POST /runs` or `POST /runs/{id}/stages` endpoints

## Phases

### Phase 1: Store layer — `services/ingest/run.go`

**Changes:**

Add a `RunsInRange` method to `Store`:

```go
import "time"

// RunsInRange lists runs whose startedAt is after (exclusive) the after bound and
// before or at (inclusive) the before bound, newest first. Passing the zero value
// for a bound leaves it open.
func (s *Store) RunsInRange(after, before time.Time) []Run {
    var out []Run
    for _, id := range s.order {
        start, err := time.Parse(time.RFC3339, s.runs[id].StartedAt)
        if err != nil {
            continue  // should not happen for stored runs
        }
        if !after.IsZero() && !start.After(after) {
            continue
        }
        if !before.IsZero() && start.After(before) {
            continue
        }
        out = append(out, s.runs[id])
    }
    sort.SliceStable(out, func(i, j int) bool { return out[i].StartedAt > out[j].StartedAt })
    return out
}
```

**Tests** (`services/ingest/run_test.go`):

1. `TestRunsInRangeReturnsOnlyMatchingRuns` — seed the store with known start times, filter to a window that should include 2 of 5, assert count and IDs.
2. `TestRunsInRangeWithNoAfterBoundIsUnboundedOnStart` — zero-value `after`, non-zero `before` returns runs older than `before`.
3. `TestRunsInRangeWithNoBeforeBoundIsUnboundedOnEnd` — non-zero `after`, zero-value `before` returns runs newer than `after`.
4. `TestRunsInRangeWithBothBoundsOpenReturnsAllRuns` — both zero-value returns all runs (same as `Runs()`).

**Verification:**

```bash
cd services/ingest && go test ./... -run 'RunsInRange' -v -count=1
cd services/ingest && go test ./... -count=1  # full suite still green
```

### Phase 2: HTTP layer — `services/ingest/http.go`

**Changes:**

In the `GET /runs` handler, after parsing `limit` but before calling `s.Runs()`:

1. Read optional `startedAfter` and `startedBefore` query params.
2. If either is present, parse it with `time.Parse(time.RFC3339, ...)`. If parsing fails, return `400 Bad Request` with error code `bad_instant`.
3. If both are present, validate with `window()` (reuse existing validation — it checks `endedAt` >= `startedAt`, but here we rename the semantic: `startedBefore` must not be before `startedAfter`). If `window()` returns an error, return 400 with `ends_before_start`.
4. If neither is present, use `s.Runs()` (no change in default behaviour).
5. If either is present, call `s.RunsInRange(after, before)` instead of `s.Runs()`.
6. Apply the `limit` truncation to the filtered result.

Error code for bad param: `bad_instant` (reuses existing code).

**Tests** (`services/ingest/http_test.go`):

1. `TestListRunsWithDateRange` — get `/runs?startedAfter=2026-09-15T12:00:00Z&startedBefore=2026-09-15T14:00:00Z`, assert exactly 2 runs (run-103, run-104).
2. `TestListRunsWithNoDateRangeReturnsAllRuns` — `/runs` with no date params returns all 5 (unchanged behaviour).
3. `TestListRunsWithBadInstantIsRefused` — `/runs?startedAfter=not-a-time` returns 400 with `bad_instant`.
4. `TestListRunsWithBackwardsRangeIsRefused` — `/runs?startedAfter=2026-09-16T00:00:00Z&startedBefore=2026-09-15T00:00:00Z` returns 400 with `ends_before_start`.

**Verification:**

```bash
cd services/ingest && go test ./... -count=1
```

### Phase 3: Console client — `apps/console/lib/ledger.ts`

**Changes:**

Update `listRuns` to accept optional date params:

```typescript
export function listRuns(limit = 50, startedAfter?: string, startedBefore?: string): Promise<Run[]> {
  const params = new URLSearchParams()
  params.set('limit', String(limit))
  if (startedAfter) params.set('startedAfter', startedAfter)
  if (startedBefore) params.set('startedBefore', startedBefore)
  return get<Run[]>(`/runs?${params.toString()}`)
}
```

The existing call `listRuns()` (no date params) continues to work unchanged — the API treats absent params as no filter.

**Tests** (`apps/console/lib/ledger.test.ts`):

No tests for `listRuns` itself — it's a thin HTTP wrapper. The existing `waterfall`, `slowestStage`, and `humanMs` tests are unaffected. (The pre-existing `@ledger/contracts` resolution issue in this test file is unrelated to this change.)

**Verification:**

```bash
cd apps/console && bun test 2>&1 | tail -15
# Expected: budget tests all pass; ledger test count unchanged (same pre-existing resolution error)
```

### Phase 4: Console page — `apps/console/app/page.tsx`

**Changes:**

1. Read `searchParams` from the page props.
2. Pass `startedAfter` and `startedBefore` to `listRuns()`.
3. Add a filter form above the metrics section with two text inputs and a submit button.

The page component signature changes to:

```tsx
export default async function Page({
  searchParams,
}: {
  searchParams?: { startedAfter?: string; startedBefore?: string }
}) {
  const after = searchParams?.startedAfter
  const before = searchParams?.startedBefore
  const runs = await listRuns(200, after, before)
  // ... rest unchanged
}
```

Add a form below the lede paragraph but above the metrics strip:

```tsx
<form className="date-range" method="GET" action="/">
  <label>
    From
    <input type="text" name="startedAfter" placeholder="2026-09-01T00:00:00Z"
           defaultValue={after ?? ''} />
  </label>
  <label>
    To
    <input type="text" name="startedBefore" placeholder="2026-09-30T23:59:59Z"
           defaultValue={before ?? ''} />
  </label>
  <button type="submit">Filter</button>
</form>
```

Increase the `listRuns` default limit from 50 to 200 when date params are present (the user explicitly wants to see a broader set). When no params are present, keep the default of 50.

**Tests:**

Manual verification only — the console page has no component tests. The `bun test` suite doesn't test this component.

**Verification:**

```bash
cd apps/console && bun run build 2>&1 | tail -10
```

## Risks

- **Improper searchParams access in Next.js.** The page component signature uses `searchParams` as a prop, which is the App Router convention. If the running Next.js version uses a different API (e.g., `useSearchParams` hook in a client component), the build will fail. The then-fix is to wrap the form-handling part in a client component — but the builder should try the server-component approach first since it's already an async server component.
- **Date range hits the `limit` ceiling.** The default limit for filtered queries is 200. If a month has more than 200 runs, the list is still truncated. The maintainer can adjust the limit param or we can increase maxLimit later — not a blocker for this plan.
- **Pre-existing test failure.** The `ledger.test.ts` file has a pre-existing `@ledger/contracts` resolution error. The builder should not chase this — it predates this change and affects different functions.

## Assumptions

- The maintainer's direction on issue #344 ("date range filter, not pagination") is authoritative for this revision.
- `services/ingest/store.go` in the issue body is a stale reference; the `Store` struct and its methods live in `services/ingest/run.go`. The plan touches `run.go` as intended.
- The HTTP API should accept RFC 3339 timestamps and no other format. The console converts date-only inputs to RFC 3339 on the server.
- Filter semantics: `startedAt > after` (exclusive start) and `startedAt <= before` (inclusive end) — a calendar-day query like `after=2026-09-01T00:00:00Z, before=2026-09-30T23:59:59Z` covers the whole month.
- `searchParams` on the Next.js page component works in the running version. If it doesn't, fall back to a client component wrapper.
- The default limit for filtered queries is 200 (the API max). Unfiltered queries keep the default of 50.
- Nothing is deleted or expired as part of this change.

## Open questions

None. Every design decision is recorded as an assumption above.

- The `window` function is reused for validating the date param ordering (`startedBefore` >= `startedAfter`). It was written for run-level start/end but the same logic applies here.
- The `RunsInRange` method skips runs whose `startedAt` cannot be parsed (should not happen for stored runs, but graceful if it does).