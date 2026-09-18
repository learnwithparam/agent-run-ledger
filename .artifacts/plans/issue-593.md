# Plan: Accept limit=0 on GET /runs

## Goal

`GET /runs?limit=0` currently returns 400 with `bad_limit`. After this change it returns 200 with an
empty array (`[]`). Negative limits and absurdly large limits (>200) continue to be rejected with 400.
A test covers the zero case and fails without the change.

## Scope

**In:**
- `services/ingest/http.go` — one-character validation fix + error message update
- `services/ingest/http_test.go` — new test for limit=0, new test for negative limit

**Out:**
- No changes to contracts, schemas, or other services
- No changes to the budget service (it doesn't use this endpoint's limit param)
- No config or documentation changes

## Phases

### Phase 1: Fix the validation in http.go

**Changes:**
- `services/ingest/http.go:26` — change `parsed < 1` to `parsed < 0`
- `services/ingest/http.go:27` — update error message from `"limit must be a number between 1 and 200."` to `"limit must be a number between 0 and 200."`

**Why this works:**
- `parsed < 0` rejects negative numbers (including -1), preserving the requirement that
  negatives return 400
- `parsed > 200` still catches absurd values (100000, etc.)
- `parsed == 0` passes validation, `limit` is set to 0, and `runs[:0]` produces an empty
  slice which serializes as `[]`

**Verification:**
```bash
cd services/ingest && go test -count=1 -run TestAnAbsurdLimitIsRefused ./...
# Still passes — absurd limits are still rejected
```

### Phase 2: Add tests

**New test in `services/ingest/http_test.go`:**

```go
func TestAZeroLimitReturnsAnEmptyList(t *testing.T) {
    rec := call(t, Seed(), http.MethodGet, "/runs?limit=0", "")
    if rec.Code != http.StatusOK {
        t.Fatalf("want 200, got %d", rec.Code)
    }
    var runs []Run
    if err := json.Unmarshal(rec.Body.Bytes(), &runs); err != nil {
        t.Fatalf("body is not a run list: %v", err)
    }
    if len(runs) != 0 {
        t.Fatalf("want 0 runs, got %d", len(runs))
    }
}

func TestANegativeLimitIsRefused(t *testing.T) {
    rec := call(t, Seed(), http.MethodGet, "/runs?limit=-1", "")
    if rec.Code != http.StatusBadRequest {
        t.Fatalf("want 400, got %d", rec.Code)
    }
    if code(t, rec.Body.Bytes()) != "bad_limit" {
        t.Fatalf("want machine-readable code bad_limit, got %s", rec.Body.String())
    }
}
```

**Verification:**
```bash
cd services/ingest && go test -v -count=1 ./...
# Expected: all 18+ tests pass (existing 16 + 2 new)
# The new TestAZeroLimitReturnsAnEmptyList fails without the Phase 1 change
```

### Phase 3: Full regression check

```bash
cd services/ingest && go test -count=1 ./... 2>&1
cd packages/contracts && go test -count=1 ./... 2>&1
```

All existing tests must pass unchanged. The schema contract tests (`TestRunMatchesTheSharedSchema`,
`TestStageMatchesTheSharedSchema`) assert the Go structs match the JSON schema — these are unaffected
since no data types changed.

## Risks

1. **No risk of regression** — the change tightens the lower bound from `0` being rejected to `0`
   being accepted. No caller depends on `limit=0` returning 400, because that was already an error.
2. **Slice semantics** — `runs[:0]` produces an empty slice (`[]` not `null`), which is the correct
   JSON serialization. If `runs` itself is nil (empty store), `nil[:0]` also produces `[]` via
   `json.Encode`, which is also correct.
3. **The `parsed < 0` bounds check** — `strconv.Atoi("-0")` returns `0`, so `-0` is accepted (same
   as `0`), which is fine since `0` is now the intended behavior. `strconv.Atoi("--1")` returns an
   error, caught by `err != nil`.

## Assumptions

- The triage findings are correct: the code at `services/ingest/http.go:26` is the sole root cause.
- No other endpoint or service validates limit parameters — this is the only paginated list endpoint.
- `limit=0` users expect an empty array (`[]`), not `null`. Go's `json.Encode` on a nil slice
  produces `null`, but `runs[:0]` converts a non-nil backing array to a zero-length slice, so it
  correctly serializes as `[]`. This holds for both seeded and empty stores.
- The error message change ("between 1 and 200" → "between 0 and 200") is the minimal update; no
  documentation or API spec references the old message verbatim.

## Open questions

None — the fix is fully specified in the issue's acceptance criteria and verified against the code.