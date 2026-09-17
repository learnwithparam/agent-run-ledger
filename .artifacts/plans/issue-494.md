# Plan: Accept limit=0 as a valid query parameter

**Issue:** #494 — `GET /runs?limit=0` returns 400 instead of an empty list.

## Goal

`GET /runs?limit=0` returns 200 with `[]`. `limit=-1` and `limit=100000` still return 400. A test covers the zero case and fails without the change.

## Scope

**In:**
- `services/ingest/http.go` — one-character validation change plus error message update
- `services/ingest/http_test.go` — one new test

**Out:**
- No changes to the Store, Run, or Stage types
- No changes to the console UI, budget service, or contracts schema
- No refactoring or unrelated cleanup

## Phases

### Phase A — Fix the validation

**File:** `services/ingest/http.go`, line 26

Change `parsed < 1` to `parsed < 0`:

```diff
-			if err != nil || parsed < 1 || parsed > 200 {
+			if err != nil || parsed < 0 || parsed > 200 {
```

Update the error message to reflect the new lower bound:

```diff
-				writeError(w, http.StatusBadRequest, "bad_limit", "limit must be a number between 1 and 200.")
+				writeError(w, http.StatusBadRequest, "bad_limit", "limit must be a number between 0 and 200.")
```

This is the entire production change.

### Phase B — Add the zero-limit test

**File:** `services/ingest/http_test.go`

Add after `TestAnAbsurdLimitIsRefused` (around line 50):

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
```

`Seed()` inserts 5 runs, so this assertion proves the truncation is working.

### Phase C — Verify

```bash
cd services/ingest && go test -v -count=1 ./...
```

Expected: all tests pass, including the new `TestAZeroLimitReturnsAnEmptyList`.

Confirm the existing tests still pass:
- `TestListRuns` — default (no limit) returns 5 runs
- `TestTheListIsBoundedByDefault` — `limit=2` returns 2 runs
- `TestAnAbsurdLimitIsRefused` — `limit=100000` returns 400

## Risks

- **Negative limits still rejected correctly**: Already covered — `parsed < 0` catches `-1`.
- **Large limits still rejected correctly**: Already covered — `parsed > 200` catches `100000`.
- **Slice bounds**: `runs[:0]` is a valid Go expression returning an empty slice. No crash risk.

## Assumptions

- `limit=0` means "return no results" (empty array), consistent with pagination conventions where zero is a page size of zero. The alternative reading ("return unlimited results") would require different logic but is not what the issue requests.
- The error message on line 27 should mention "0" as the lower bound to match the new validation. This is a documentation correction, not a behavior change.

## Open questions

None.