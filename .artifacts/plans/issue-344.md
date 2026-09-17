# Add pagination to the console run list

Issue: https://github.com/learnwithparam/agent-run-ledger/issues/344
Branch: `factory/issue-344`

## Goal

Add offset-based pagination to `GET /runs` so the console can reach runs beyond the first page. The console gets Previous/Next navigation, and each page shows at most 50 runs.

## Scope

**In**
- `GET /runs` accepts an `offset` query parameter (default 0, non-negative integer)
- `Store.Runs(offset, limit)` slices the sorted run list
- `listRuns(limit, offset)` passes both params to the API
- The page component reads `?page=N` from URL search params, computes offset, and renders Previous/Next links
- Go tests for the new offset parameter
- Console tests for `listRuns` with offset

**Out**
- No wrapper response type (`[]Run` stays as-is — client infers "more pages" from `results.length === limit`)
- No total count endpoint or header
- No page-number display (just Previous/Next)
- No change to budget metrics (they aggregate over the displayed page only)
- No keyset/cursor pagination
- No schema changes to `run.schema.json`

## Phases

### Phase 1: Ingest — Store layer

**Files**
- `services/ingest/run.go` — `Store.Runs()` signature changes to `Runs(offset, limit int) []Run`

**Change**
Replace the current `Runs()` that returns all runs sorted with one that slices by offset+limit:

```go
func (s *Store) Runs(offset, limit int) []Run {
    out := make([]Run, 0, len(s.order))
    for _, id := range s.order {
        out = append(out, s.runs[id])
    }
    sort.SliceStable(out, func(i, j int) bool { return out[i].StartedAt > out[j].StartedAt })
    if offset >= len(out) {
        return nil
    }
    end := offset + limit
    if end > len(out) {
        end = len(out)
    }
    return out[offset:end]
}
```

**Tests** — Run `go test ./...` from `services/ingest`

After this change, existing `s.Runs()` callers will break at compile time (good — the compiler catches every site).

### Phase 2: Ingest — HTTP handler

**Files**
- `services/ingest/http.go` — `GET /runs` handler

**Change**
Add `offset` query parameter parsing alongside the existing `limit` param. Replace the post-fetch slice with a call to `s.Runs(offset, limit)`:

```go
offset := 0
if raw := r.URL.Query().Get("offset"); raw != "" {
    parsed, err := strconv.Atoi(raw)
    if err != nil || parsed < 0 {
        writeError(w, http.StatusBadRequest, "bad_offset", "offset must be a non-negative integer.")
        return
    }
    offset = parsed
}
// ...existing limit parsing...
runs := s.Runs(offset, limit)
writeJSON(w, http.StatusOK, runs)
```

**Tests** — `services/ingest/http_test.go`

Update existing tests that relied on the full 5-run response:
- `TestListRuns` — should still pass (offset=0, limit=50 returns all 5)
- `TestTheListIsBoundedByDefault` — should still pass (limit=2 returns 2)

Add new tests:
- `TestOffsetSkipsFirstNRuns` — call `/runs?offset=2`, expect 3 runs
- `TestOffsetCombinedWithLimit` — call `/runs?offset=1&limit=2`, expect 2 runs (indices 1,2 of 5)
- `TestOffsetPastEndReturnsEmpty` — call `/runs?offset=100`, expect empty response
- `TestNegativeOffsetIsRefused` — call `/runs?offset=-1`, expect 400

### Phase 3: Console — ledger client

**Files**
- `apps/console/lib/ledger.ts` — `listRuns()`

**Change**
Add `offset` parameter (default 0), pass it to the query string:

```ts
export function listRuns(limit = 50, offset = 0): Promise<Run[]> {
    return get<Run[]>(`/runs?limit=${limit}&offset=${offset}`)
}
```

**Tests** — `apps/console/lib/ledger.test.ts`

Add a test for `listRuns` that verifies the URL is constructed correctly. Since `get` is internal, test through `listRuns` — but note that `get` wraps `fetch` which doesn't exist in the test environment. Either mock `globalThis.fetch` or test the URL construction. Simplest approach: test the URL construction via a simple mock:

```ts
test('listRuns passes offset to the API', async () => {
  const originalFetch = globalThis.fetch
  let calledPath = ''
  globalThis.fetch = async (input: RequestInfo | URL) => {
    calledPath = typeof input === 'string' ? input : input.toString()
    return new Response('[]', { status: 200 })
  }
  try {
    await listRuns(50, 10)
    expect(calledPath).toContain('offset=10')
  } finally {
    globalThis.fetch = originalFetch
  }
})
```

### Phase 4: Console — page component

**Files**
- `apps/console/app/page.tsx`

**Change**
1. Accept `searchParams` in the page component per Next.js 16 convention.
2. Read `page` from search params, compute `offset = (page - 1) * limit`.
3. Pass offset to `listRuns(limit, offset)`.
4. Add Previous/Next navigation links below the table.

```tsx
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageStr } = await searchParams
  const page = Math.max(1, Number(pageStr) || 1)
  const offset = (page - 1) * 50

  let runs
  try {
    runs = await listRuns(50, offset)
  } catch (error) {
    return (
      <Shell>
        <Unreachable reason={error instanceof Error ? error.message : String(error)} />
      </Shell>
    )
  }

  // ...existing empty check, period/spend/budget, table...

  const hasNext = runs.length === 50

  return (
    <Shell>
      {/* ...existing sections (strip, metrics, table)... */}
      <nav className="pagination">
        {page > 1 && (
          <Link href={`/?page=${page - 1}`}>← Previous</Link>
        )}
        {hasNext && (
          <Link href={`/?page=${page + 1}`}>Next →</Link>
        )}
      </nav>
    </Shell>
  )
}
```

Note: `page > 1` determines "is there a previous page" because page 1 is the default (no offset).
`hasNext = runs.length === 50` because when fewer runs return, we're on the last page.

**Tests** — manual verification (the page is a server component rendering dynamic data). Run `bun run lint` and `tsc --noEmit` from `apps/console`.

## Verification

After each phase, run the relevant verification:

| Phase | Command | Directory |
|-------|---------|-----------|
| 1+2   | `go test ./... -v` | `services/ingest` |
| 3+4   | `bun run typecheck` or `tsc --noEmit` | `apps/console` |
| 4     | `bun run build` (optional, if deps installed) | `apps/console` |

Final integrated check:
```bash
cd services/ingest && go test ./...
cd ../../apps/console && bun test
```

## Risks

1. **Existing Go callers break at compile time** — mitigated: the only `s.Runs()` calls are in `http.go` and test files. The compiler catches them immediately.
2. **`hasNext` edge case** — when exactly 50 runs exist and no more, the user sees a "Next →" link that leads to an empty page. Acceptable for a lab tool; the user sees the empty page and stops clicking. No data loss.
3. **Budget metrics on page 2+** — `periodOf(runs[0]!.startedAt)` uses the first run on the current page. If page 2 shows runs from a different calendar month, the budget metrics will be for that month instead. This is existing behavior, not introduced by pagination. Not in scope.
4. **Negative offset or non-numeric page** — guarded by `strconv.Atoi` + `parsed < 0` check on the server, and `Math.max(1, Number(pageStr) || 1)` on the client.

## Assumptions

1. Offset-based pagination is right for an in-memory store where runs are only appended (never deleted) — keyset/cursor is unnecessary complexity.
2. Keeping the `[]Run` response (no wrapper) matches existing API patterns and keeps contract changes minimal.
3. The `hasNext` inference from `results.length === limit` is sufficient — the exact-total edge case is acceptable for a lab console.
4. The page's budget metrics are not fixed to work across pages because the issue scope is "reach runs beyond the first page," not "compute correct aggregates across all pages."
5. `searchParams` in Next.js 16 is a Promise — the current codebase pattern follows this convention.
6. The pre-existing `@ledger/contracts` resolution error in the console test suite is a workspace setup issue, not related to this change.

## Open questions

None. All design decisions are resolved from codebase patterns,
issue scope, and the AGENTS.md rules.