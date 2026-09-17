# Keep runs for longer than the console can show

**Issue**: https://github.com/learnwithparam/agent-run-ledger/issues/379

## Goal

Add offset-based pagination to the run list so the console reader can navigate beyond the first page of results. The ingest service remains the single source of truth for what a run is; the console only reads. Nothing is deleted, expired, or dropped.

**Done when**: A reader on the console page sees prev/next navigation, clicks through to page 2+, and the Go test suite passes with new tests exercising offset, limit+offset, past-the-end, and negative offset.

## Scope

**In:**
- `GET /runs` accepts `offset` query param (non-negative integer, default 0)
- Console `listRuns()` accepts and forwards `offset`
- Console page reads `page` from `searchParams`, computes offset, renders prev/next links
- New Go tests for offset behavior

**Out:**
- Date range filtering — solves a related but distinct use case; can be added independently later
- Cursor/keyset pagination — over-engineered for an in-memory store
- Changes to `Store.Runs()` — offset/limit stays in the HTTP handler, keeps the Store simple
- Changes to `packages/contracts` — no schema or contract changes needed
- Changes to the single-run page (`/runs/[id]/page.tsx`) — unrelated

## Phases

### Phase 1: Add `offset` to `GET /runs` handler

**File**: `services/ingest/http.go`

In the `GET /runs` handler, after `limit` parsing and before the existing limit truncation, parse an `offset` query param:

```go
// Offset first, then limit. A page past the end returns an empty list
// rather than an error, because reaching the last page is expected.
offset := 0
if raw := r.URL.Query().Get("offset"); raw != "" {
    parsed, err := strconv.Atoi(raw)
    if err != nil || parsed < 0 {
        writeError(w, http.StatusBadRequest, "bad_offset", "offset must be a non-negative number.")
        return
    }
    offset = parsed
}
if offset >= len(runs) {
    runs = nil
} else {
    runs = runs[offset:]
}
```

The existing `limit` truncation (`if len(runs) > limit { runs = runs[:limit] }`) stays in place after the offset slicing.

**Tests**: See Phase 4.

**Verification**: `cd services/ingest && go test ./...`

### Phase 2: Add `offset` to console's `listRuns`

**File**: `apps/console/lib/ledger.ts`

Add `offset = 0` parameter and pass it in the URL:

```typescript
export function listRuns(limit = 50, offset = 0): Promise<Run[]> {
    return get<Run[]>(`/runs?limit=${limit}&offset=${offset}`)
}
```

No behavioural change for existing callers (`listRuns()` continues to work — offset defaults to 0).

**Tests**: No separate tests for this function — it's a thin HTTP wrapper. The existing `waterfall`, `slowestStage`, and `humanMs` tests are unaffected.

**Verification**: `cd apps/console && bun test` (requires `bun install` first)

### Phase 3: Add pagination UI

**File**: `apps/console/app/page.tsx`

1. Accept `searchParams` (Next.js App Router pattern — async Promise):

```tsx
export default async function Page({
    searchParams,
}: {
    searchParams: Promise<{ page?: string }>
}) {
    const { page: pageStr } = await searchParams
    const page = Math.max(1, Number(pageStr ?? 1))
    const limit = 50
    const offset = (page - 1) * limit
    // ... existing logic with `runs = await listRuns(limit, offset)`
```

2. Replace `listRuns()` call with `listRuns(limit, offset)`.
3. Change the empty-state check to only show the `NoRuns` component on page 1 (empty page 2+ means the end of the list, not "no runs yet"):

```tsx
if (runs.length === 0 && page === 1) {
    // existing NoRuns block
}
```

4. Add pagination navigation below the table:

```tsx
<nav className="pagination">
    {page > 1 && (
        <Link href={`/?page=${page - 1}`}>&larr; Previous</Link>
    )}
    {runs.length >= limit && (
        <Link href={`/?page=${page + 1}`}>Next &rarr;</Link>
    )}
</nav>
```

The "Next" link heuristic: if we got a full page back, there are probably more runs. This is the standard pattern for offset-based pagination.

**Tests**: Manual verification only — the console page has no component tests.

**Verification**: `cd apps/console && bun run build 2>&1 | tail -10`

### Phase 4: Add Go tests

**File**: `services/ingest/http_test.go`

Add four new tests after `TestAnAbsurdLimitIsRefused`:

1. `TestOffsetSkipsRuns` — `GET /runs?offset=2&limit=2` returns 2 runs, starting from run-103 (skip run-105, run-104).
2. `TestAnOffsetPastTheEndIsEmpty` — `GET /runs?offset=10` returns 200 + empty `[]`.
3. `TestOffsetAndLimitTogether` — `GET /runs?offset=1&limit=3` returns 3 runs, starting from run-104.
4. `TestANegativeOffsetIsRefused` — `GET /runs?offset=-1` returns 400 with `bad_offset` code.

Seed data (5 runs sorted newest-first):
- run-105 (2026-09-16), run-104 (2026-09-15), run-103, run-102, run-101

**Verification**: `cd services/ingest && go test ./... -v` — all existing tests pass + 4 new pass.

## Risks

- **Next.js `searchParams` API**: The App Router `searchParams` prop is `Promise<{...}>` in Next.js 16. If the running version differs, the build will fail. The fix is to adjust the type — the prior PR #372 used this same pattern successfully for this exact codebase version.
- **Pre-existing test failure**: If `bun test` in the console has pre-existing failures (e.g., resolution errors in `ledger.test.ts`), those predate this change and should not be chased.
- **Empty page 2+**: If `runs.length === 0` on page > 1, the page currently shows `NoRuns` (wrong — should show pagination only). The check is changed to only show NoRuns on page 1.

## Assumptions

- The `Store` itself does not need offset/limit support — the HTTP handler slices the full list. This keeps the Store simple and follows the existing pattern (the Store returns everything, the handler truncates).
- `searchParams` in Next.js 16 App Router is `Promise<{...}>`. PR #372 used this same pattern for this codebase and it worked.
- The "Next" link heuristic (`runs.length >= limit`) is sufficient. An exact count would require the Store to expose total run count, which adds complexity without proportional benefit for an in-memory store.
- `services/ingest/store.go` referenced in the issue body is a stale path — the Store struct lives in `services/ingest/run.go` and does not need changes.
- No changes to `packages/contracts/**` are needed — `autonomy: propose` would require plan approval; the plan doesn't touch it.
- Default limit stays at 50. The issue asks for pagination, not for changing the page size.

## Open questions

None. Every design decision is recorded as an assumption above.