# Plan: Keep runs for longer than the console can show — date range filter

Issue: #636
Stage: Planning → Execute

## Goal

A month-end reviewer can constrain the run list to a specific date range via `startedAfter` and `startedBefore` query parameters. The ingest service filters runs in its `Runs()` method, and the console provides a date-range form that updates the URL so the filter survives refresh.

## Scope

### In

- `services/ingest/run.go`: change `Runs()` to accept optional `after` and `before` `*time.Time` filter params
- `services/ingest/http.go`: parse `startedAfter` and `startedBefore` RFC 3339 query params on `GET /runs`; return 400 for unparseable timestamps
- `apps/console/lib/ledger.ts`: update `listRuns()` to accept and forward `startedAfter`/`startedBefore`
- `apps/console/app/page.tsx`: accept `searchParams`, read `startedAfter`/`startedBefore`, render a date-range form, pass filters to `listRuns()`
- Go tests: filter bounds, filter returns empty, malformed timestamps rejected
- Console: manual verification

### Explicitly Out

- No offset-based pagination (author rejected this approach)
- No cursor/keyset pagination
- No run-count or total-pages endpoint
- No changes to seed data (the 5 existing runs have two distinct dates — enough to test)
- No changes to `packages/contracts`
- No changes to stages or budget endpoints

## Phases

### Phase 1: Ingest store — add date range filtering to `Runs()`

**File:** `services/ingest/run.go` line 117

Change the method signature and add filtering:

```go
// Runs lists runs newest first, optionally filtered by the given time range.
// A nil after or before pointer means the bound is open.
func (s *Store) Runs(after, before *time.Time) []Run {
	out := make([]Run, 0, len(s.order))
	for _, id := range s.order {
		out = append(out, s.runs[id])
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].StartedAt > out[j].StartedAt })
	if after != nil || before != nil {
		filtered := make([]Run, 0, len(out))
		for _, r := range out {
			started, err := time.Parse(time.RFC3339, r.StartedAt)
			if err != nil {
				continue // skip unparseable timestamps (should not happen for stored data)
			}
			if after != nil && !started.After(*after) {
				continue
			}
			if before != nil && !started.Before(*before) {
				continue
			}
			filtered = append(filtered, r)
		}
		out = filtered
	}
	return out
}
```

**Update callers of `Runs()`:**

- `http.go:20`: `s.Runs()` → `s.Runs(after, before)` (after/before parsed in the handler)
- `run_test.go:27`: `s.Runs()` → `s.Runs(nil, nil)`
- `run_test.go:36` and `.105`: `Seed().Runs()` → `Seed().Runs(nil, nil)`

**New tests** in `run_test.go`:

```go
func TestFilterAfterReturnsNewerRuns(t *testing.T) {
    after := parseTime(t, "2026-09-16T00:00:00Z")
    runs := Seed().Runs(&after, nil)
    for _, r := range runs {
        started, _ := time.Parse(time.RFC3339, r.StartedAt)
        if !started.After(after) {
            t.Fatalf("run %s is not after the filter time", r.ID)
        }
    }
    if len(runs) != 1 { // run-105 is the only one on Sep 16
        t.Fatalf("want 1 run after Sep 16, got %d", len(runs))
    }
}

func TestFilterBeforeReturnsOlderRuns(t *testing.T) {
    before := parseTime(t, "2026-09-16T00:00:00Z")
    runs := Seed().Runs(nil, &before)
    for _, r := range runs {
        started, _ := time.Parse(time.RFC3339, r.StartedAt)
        if !started.Before(before) {
            t.Fatalf("run %s is not before the filter time", r.ID)
        }
    }
    if len(runs) != 4 { // runs 101-104 are on Sep 15
        t.Fatalf("want 4 runs before Sep 16, got %d", len(runs))
    }
}

func TestFilterBothBoundsReturnsIntersection(t *testing.T) {
    after := parseTime(t, "2026-09-15T10:00:00Z")
    before := parseTime(t, "2026-09-15T12:00:00Z")
    runs := Seed().Runs(&after, &before)
    if len(runs) != 2 { // run-102 at 10:14, run-103 at 11:01
        t.Fatalf("want 2 runs, got %d", len(runs))
    }
}

func TestFilterReturnsEmptyWhenNothingMatches(t *testing.T) {
    after := parseTime(t, "2026-10-01T00:00:00Z")
    runs := Seed().Runs(&after, nil)
    if len(runs) != 0 {
        t.Fatalf("want 0 runs, got %d", len(runs))
    }
}
```

Add a helper:

```go
func parseTime(t *testing.T, s string) time.Time {
    t.Helper()
    parsed, err := time.Parse(time.RFC3339, s)
    if err != nil {
        t.Fatal(err)
    }
    return parsed
}
```

**Verification:**

```bash
cd services/ingest && go test ./... -v -count=1
```

### Phase 2: Ingest HTTP — parse `startedAfter` and `startedBefore`

**File:** `services/ingest/http.go` lines 19–36

Update the `GET /runs` handler:

```go
mux.HandleFunc("GET /runs", func(w http.ResponseWriter, r *http.Request) {
    // Date range filter params (RFC 3339).
    var after, before *time.Time
    if raw := r.URL.Query().Get("startedAfter"); raw != "" {
        parsed, err := time.Parse(time.RFC3339, raw)
        if err != nil {
            writeError(w, http.StatusBadRequest, "bad_instant", "startedAfter must be RFC 3339.")
            return
        }
        after = &parsed
    }
    if raw := r.URL.Query().Get("startedBefore"); raw != "" {
        parsed, err := time.Parse(time.RFC3339, raw)
        if err != nil {
            writeError(w, http.StatusBadRequest, "bad_instant", "startedBefore must be RFC 3339.")
            return
        }
        before = &parsed
    }

    runs := s.Runs(after, before)

    // Bounded by default.
    limit := 50
    if raw := r.URL.Query().Get("limit"); raw != "" {
        parsed, err := strconv.Atoi(raw)
        if err != nil || parsed < 1 || parsed > 200 {
            writeError(w, http.StatusBadRequest, "bad_limit", "limit must be a number between 1 and 200.")
            return
        }
        limit = parsed
    }
    if len(runs) > limit {
        runs = runs[:limit]
    }
    writeJSON(w, http.StatusOK, runs)
})
```

**New HTTP tests** in `http_test.go`:

```go
func TestFilterReturnsOnlyMatchingRuns(t *testing.T) {
    rec := call(t, Seed(), http.MethodGet, "/runs?startedAfter=2026-09-16T00:00:00Z", "")
    if rec.Code != http.StatusOK {
        t.Fatalf("want 200, got %d", rec.Code)
    }
    var runs []Run
    json.Unmarshal(rec.Body.Bytes(), &runs)
    if len(runs) != 1 {
        t.Fatalf("want 1 run after Sep 16, got %d", len(runs))
    }
}

func TestBadStartedAfterIsRefused(t *testing.T) {
    rec := call(t, Seed(), http.MethodGet, "/runs?startedAfter=not-a-timestamp", "")
    if rec.Code != http.StatusBadRequest {
        t.Fatalf("want 400, got %d", rec.Code)
    }
    if code(t, rec.Body.Bytes()) != "bad_instant" {
        t.Fatalf("want bad_instant code, got %s", rec.Body.String())
    }
}

func TestBadStartedBeforeIsRefused(t *testing.T) {
    rec := call(t, Seed(), http.MethodGet, "/runs?startedBefore=also-invalid", "")
    if rec.Code != http.StatusBadRequest {
        t.Fatalf("want 400, got %d", rec.Code)
    }
    if code(t, rec.Body.Bytes()) != "bad_instant" {
        t.Fatalf("want bad_instant code, got %s", rec.Body.String())
    }
}
```

**Also update `TestTheListIsBoundedByDefault`** — the existing limit test should still pass with the added filter params since they default to nil.

**Update `TestListRuns`** — make sure the `GET /runs` path still returns 5 runs when no filter params are provided (the existing test uses `GET /runs` directly and should still pass as-is).

**Verification:**

```bash
cd services/ingest && go test ./... -v -count=1
```

### Phase 3: Console — add date range form and pass filters

**File:** `apps/console/lib/ledger.ts` line 44

Update `listRuns()`:

```typescript
export function listRuns(limit = 50, startedAfter?: string, startedBefore?: string): Promise<Run[]> {
    let path = `/runs?limit=${limit}`
    if (startedAfter) path += `&startedAfter=${encodeURIComponent(startedAfter)}`
    if (startedBefore) path += `&startedBefore=${encodeURIComponent(startedBefore)}`
    return get<Run[]>(path)
}
```

**File:** `apps/console/app/page.tsx`

Accept `searchParams`, read the filter values, render a date-range form:

```tsx
export default async function Page({
    searchParams,
}: {
    searchParams: Promise<{ startedAfter?: string; startedBefore?: string }>
}) {
    const params = await searchParams
    const startedAfter = params.startedAfter ?? ''
    const startedBefore = params.startedBefore ?? ''

    let runs
    try {
        runs = await listRuns(50, startedAfter || undefined, startedBefore || undefined)
    } catch (error) {
        return (
            <Shell>
                <Unreachable reason={error instanceof Error ? error.message : String(error)} />
            </Shell>
        )
    }

    if (runs.length === 0) {
        return (
            <Shell>
                <NoRuns />
            </Shell>
        )
    }

    // ... existing period/spend/budget/refused computation ...

    return (
        <Shell>
            {/* ... metrics strip ... */}
            <main>
                <div className="wrap">
                    <h2>Runs</h2>
                    <form method="GET" className="date-range">
                        <label>
                            From
                            <input type="datetime-local" name="startedAfter"
                                   defaultValue={startedAfter} />
                        </label>
                        <label>
                            To
                            <input type="datetime-local" name="startedBefore"
                                   defaultValue={startedBefore} />
                        </label>
                        <button type="submit">Filter</button>
                        {(startedAfter || startedBefore) && (
                            <a href="/" className="clear">Clear</a>
                        )}
                    </form>
                    {/* ... table ... */}
                </div>
            </main>
        </Shell>
    )
}
```

**Note on `datetime-local` input:** The browser sends the value in the format `YYYY-MM-DDTHH:MM` (local time, no timezone suffix). This is NOT valid RFC 3339. To avoid this issue, use a `<input type="date">` approach instead and construct the RFC 3339 timestamps server-side in the form action. The simplest approach: use two `<input type="date">` fields, and in the handler, expand them to full-day RFC 3339 bounds (`T00:00:00Z` for `startedAfter`, `T23:59:59Z` for `startedBefore`).

**Updated page approach:**

```tsx
export default async function Page({
    searchParams,
}: {
    searchParams: Promise<{ afterDate?: string; beforeDate?: string }>
}) {
    const params = await searchParams

    // Build RFC 3339 timestamps from date-only inputs
    const startedAfter = params.afterDate ? `${params.afterDate}T00:00:00Z` : ''
    const startedBefore = params.beforeDate ? `${params.beforeDate}T23:59:59Z` : ''

    let runs
    try {
        runs = await listRuns(50, startedAfter || undefined, startedBefore || undefined)
    } catch { /* ... */ }
```

```tsx
<form method="GET" className="date-range">
    <label>
        From
        <input type="date" name="afterDate" defaultValue={params.afterDate ?? ''} />
    </label>
    <label>
        To
        <input type="date" name="beforeDate" defaultValue={params.beforeDate ?? ''} />
    </label>
    <button type="submit">Filter</button>
    {(params.afterDate || params.beforeDate) && (
        <a href="/">Clear</a>
    )}
</form>
```

**Verification:**

```bash
cd apps/console && bun run dev &
# Visit http://localhost:3070
# Set date range and click Filter — URL updates
# Confirm "Clear" link appears when filter is active
# Confirm runs are filtered correctly
```

**Risk addressed:** The `type="date"` input produces `YYYY-MM-DD` values. The page expands `afterDate` to `T00:00:00Z` (inclusive start of day) and `beforeDate` to `T23:59:59Z` (inclusive end of day), producing valid RFC 3339 timestamps for the ingest service.

## Risks

1. **Timezone mismatch.** `<input type="date">` values are in the user's local timezone, but the page appends `Z` (UTC). For a month-end review this is fine — the reviewer looks at dates, not hours. Documented as acceptable for a lab/tool.
2. **No total run count.** The console shows `Runs: {filtered_count}` from the current page only. Without a total-count endpoint the user can't know "there are 47 runs this month, showing 5." The issue doesn't ask for a count — just to reach runs beyond the first page.
3. **`startedAfter`/`startedBefore` are inclusive-exclusive.** `StartedAt > after` means the run must be strictly after; `StartedAt < before` means strictly before. Using `T00:00:00Z` and `T23:59:59Z` gives the expected behavior for day-level filtering.

## Assumptions

- **Date range filter, not pagination.** The author directly rejected pagination and requested date range filtering.
- **`*time.Time` nil ptr convention.** Following Go convention: nil = no bound, non-nil = filter applies. Zero `time.Time` is not used as a sentinel to avoid the edge case where filtering on year 1 runs is confusing.
- **`type="date"` HTML input, not `datetime-local`.** Avoiding timezone issues by using date-only input and expanding server-side.
- **The `limit` param stays.** Even with date filtering, we keep the 50-run default cap. A month with thousands of runs would still be bounded.
- **No `store.go` exists.** The store lives entirely in `run.go` — matching the issue's original file reference adjusted.

## Open Questions

None. Every design decision is settled by the author's direction, the codebase's patterns, and the acceptance criteria.