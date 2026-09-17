# Plan: Add pagination to the console runs list

Issue: https://github.com/learnwithparam/agent-run-ledger/issues/439

## Goal

The console displays the most recent runs, but cannot reach older entries beyond the first page. The reader can navigate to earlier (and back to newer) pages via offset-based pagination. The ingest service remains the single source of truth for runs. Nothing is deleted or expired.

## Scope

### In scope

- Add offset-based pagination to `GET /runs` on the ingest service.
- Add pagination navigation to the console page (`apps/console/app/page.tsx`).
- Update the console ledger client (`apps/console/lib/ledger.ts`) to pass the offset.
- Verify with tests at both store and HTTP layers.

### Explicitly out of scope

- Keyset/cursor pagination. The Store is an in-memory slice; offset is simpler and matches the prior attempt's pattern. A future database-backed store can introduce keyset pagination.
- Search or filtering by run attributes.
- Exposing total run count. The console infers "has next page" from a full response page (see Design).
- Deleting or expiring runs. The Store has no expiry logic and this change adds none.

## Phases

Each phase is independently verifiable.

### Phase 1: Backend — `Store.RunsPaginated`

**Changes** — `services/ingest/run.go`:

Add a `RunsPaginated(limit, offset int) []Run` method on `*Store`. It calls `s.Runs()` (which returns newest-first), then slices `all[offset:end]` where `end = min(offset + limit, len(all))`. Returns `nil` when `offset >= len(all)`.

```go
func (s *Store) RunsPaginated(limit, offset int) []Run {
    all := s.Runs()
    if offset >= len(all) {
        return nil
    }
    end := offset + limit
    if end > len(all) {
        end = len(all)
    }
    return all[offset:end]
}
```

**Tests** — `services/ingest/run_test.go`:

- `TestRunsPaginatedReturnsPages`: table-driven test covering first page, second page, partial last page, beyond-end (returns 0).
- `TestRunsPaginatedPreservesOrder`: verifies the returned slice is newest-first.

**Verification**: `go test -run TestRunsPaginated ./services/ingest`

### Phase 2: Backend — `offset` query parameter on `GET /runs`

**Changes** — `services/ingest/http.go`:

Replace the inline slice-clipping logic (`s.Runs()` → `runs[:limit]`) with a call to `s.RunsPaginated(limit, offset)`. Read the `offset` query parameter, defaulting to 0. Validate it as a non-negative integer; return 400 with code `bad_offset` on failure.

```go
offset := 0
if raw := r.URL.Query().Get("offset"); raw != "" {
    parsed, err := strconv.Atoi(raw)
    if err != nil || parsed < 0 {
        writeError(w, http.StatusBadRequest, "bad_offset", "offset must be a non-negative number.")
        return
    }
    offset = parsed
}
writeJSON(w, http.StatusOK, s.RunsPaginated(limit, offset))
```

**Tests** — `services/ingest/http_test.go`:

- `TestOffsetSkipsRuns`: `GET /runs?limit=2&offset=2` returns 2 runs (skips first 2 of 5).
- `TestOffsetPastEndReturnsEmpty`: `GET /runs?limit=2&offset=100` returns an empty list.
- `TestBadOffsetIsRefused`: `GET /runs?offset=-1` returns 400 with code `bad_offset`.

**Verification**: `go test ./services/ingest/...`

### Phase 3: Frontend — ledger client

**Changes** — `apps/console/lib/ledger.ts`:

Update `listRuns` signature to accept `offset` as a second parameter (default 0). Append `&offset=${offset}` to the URL.

```ts
export function listRuns(limit = 50, offset = 0): Promise<Run[]> {
    return get<Run[]>(`/runs?limit=${limit}&offset=${offset}`)
}
```

**No new tests needed** — the backend tests cover offset handling; the client is a mechanical passthrough.

**Verification**: `bun test` (existing ledger tests should still pass; the `@ledger/contracts` resolution failure is a pre-existing environment issue, not caused by this change).

### Phase 4: Frontend — pagination navigation UI

**Changes** — `apps/console/app/page.tsx`:

1. Read `offset` from `searchParams` (Next.js 16 async Promise pattern).
2. Pass `offset` to `listRuns(PAGE_LIMIT, offset)`.
3. Compute `hasNext = runs.length === PAGE_LIMIT` and `hasPrev = offset > 0`.
4. Render a `<nav className="pagination">` below the runs table with two links: `← Newer` (href `?offset=${offset - PAGE_LIMIT}`) and `Older →` (href `?offset=${offset + PAGE_LIMIT}`). Replace each link with a disabled `<span>` at the boundary.

Add a `PAGE_LIMIT` constant (50) matching the backend default.

**Changes** — `apps/console/app/globals.css`:

Add `.pagination` styles: flexbox centered row with gap, `.pagination a` styled as bordered buttons with hover effect, `.pagination .disabled` using muted colour and reduced opacity.

**No new tests needed** — the pagination is purely declarative (server-rendered links from searchParams). Existing test infrastructure (`@ledger/contracts` resolution) blocks JS tests in this environment.

**Verification**: Manual check — load console at `/?offset=0`, click "Older →", verify URL updates and different runs appear.

## Risks

| Risk | Detection |
|------|-----------|
| Backend offset logic off-by-one | `TestRunsPaginatedReturnsPages` hits exact page boundaries |
| Negative offset accepted | `TestBadOffsetIsRefused` |
| Offset past end panics (index out of bounds) | `RunsPaginated` guards with `offset >= len(all) → nil`; `TestRunsPaginatedReturnsPages` includes beyond-end case |
| Page boundary link renders when no more pages | `hasNext` inferred from response length; if response is exactly PAGE_LIMIT but there is no next page, the "Older →" link shows an empty next page — acceptable UX, the empty page shows no runs but the link remains clickable. To tighten, the store could return a "has_more" flag, but that adds API surface for an edge case with no real cost. |

## Assumptions

1. **Offset-based, not keyset.** The Store is an in-memory slice; offset is simpler and was the approach in the 6 prior closed-but-unmerged PRs. If the Store ever moves to a database, keyset pagination can replace it at that point.
2. **`hasNext` inferred from page fullness.** This is an approximation — a full page might be the last page. Exposing a total-count or `has_more` flag from the API would be more accurate but adds surface for a minor UX edge case. If a maintainer objects, a `has_more` response field can be added in a follow-up.
3. **No breaking change.** The `offset` parameter is optional (default 0). Existing consumers that call `GET /runs` without offset get the same results as before.
4. **The 6 prior closed PRs were not closed for technical reasons.** No reviewer comments exist on any of them. The current implementation follows the same pattern as PR #416 but omits the `.gitignore` change it included.
5. **Next.js 16 async searchParams.** The console uses Next.js ^16.1.2. `searchParams` is a `Promise` that must be awaited. The implementation follows the pattern documented in `node_modules/next/dist/docs/`.

## Open questions

None — every design fork was answerable from codebase history and patterns. All decisions are recorded as assumptions above.