# Plan: Accept limit=0 as a valid query parameter

Issue: https://github.com/learnwithparam/agent-run-ledger/issues/468

## Goal

`GET /runs?limit=0` returns HTTP 200 with an empty JSON array (`[]`) instead of HTTP 400 with `bad_limit`. Negative limits and limits above 200 continue to be rejected.

## Scope

**In scope:**
- `services/ingest/http.go` — the validation guard and error message
- `services/ingest/http_test.go` — one new test case

**Out of scope:**
- `services/ingest/run.go` — no data model changes needed
- `services/ingest/seed.go` — no seed data changes
- `apps/console/` — no console consumer changes; the console doesn't send `limit=0`
- Any other endpoint or service

## Phases

### Phase 1 — Fix the validation guard

**File:** `services/ingest/http.go`, line 26

Change the guard from `parsed < 1` to `parsed < 0`:

```go
// Before:
if err != nil || parsed < 1 || parsed > 200 {
    writeError(w, http.StatusBadRequest, "bad_limit", "limit must be a number between 1 and 200.")

// After:
if err != nil || parsed < 0 || parsed > 200 {
    writeError(w, http.StatusBadRequest, "bad_limit", "limit must be a number between 0 and 200.")
```

**Why this works:** When `limit=0`, the existing slice truncation `runs[:0]` produces an empty slice, which serializes to `[]`. No special-casing is needed. Negative values (`parsed < 0`) are still rejected. Values above 200 are still rejected.

**Verification:**
```bash
cd services/ingest && go test -run "TestAnAbsurdLimitIsRefused" -v
```

### Phase 2 — Add test for zero limit

**File:** `services/ingest/http_test.go`

Add a new test after `TestAnAbsurdLimitIsRefused`:

```go
func TestZeroLimitReturnsEmptyList(t *testing.T) {
    rec := call(t, Seed(), http.MethodGet, "/runs?limit=0", "")
    if rec.Code != http.StatusOK {
        t.Fatalf("want 200, got %d", rec.Code)
    }
    var runs []Run
    if err := json.Unmarshal(rec.Body.Bytes(), &runs); err != nil {
        t.Fatalf("body is not a run list: %v", err)
    }
    if len(runs) != 0 {
        t.Fatalf("want an empty list, got %d runs", len(runs))
    }
}
```

**Verification:** This test fails without Phase 1 and passes after it. It uses the same `call` helper and `Seed` store as the existing tests, following the established test conventions.

### Phase 3 — Run full test suite

```bash
cd services/ingest && go test ./... -v -count=1
```

All existing tests pass unchanged. The new test passes.

## Risks

- **None identified.** The change is a single-character guard relaxation. The truncation path already handles `limit=0` correctly (empty slice). The error message is cosmetic. All existing tests continue to pass.

## Assumptions

- `limit=0` meaning "return no rows" is the semantically correct interpretation (established in triage, confirmed by the issue author as maintainer).
- The existing `runs[:limit]` slice operation is sufficient — no early-return branch is needed for the zero case.
- No consumer sends `limit="0"` as a string that would fail `strconv.Atoi` (that case is already handled by the `err != nil` branch).

## Open questions

None.