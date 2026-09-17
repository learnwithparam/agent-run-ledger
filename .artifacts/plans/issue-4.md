# Plan: Add `toolCalls` as a required integer on the run schema

**Issue:** Record how many tool calls a whole run made (#4 / #539)

---

## Goal

Add `toolCalls` as a required integer field on the run schema, matching the existing `toolCalls` field on stages. Every language (TypeScript, Go, Rust) asserts its definition against the shared schema. The seed data carries totals, and the console displays them. After this change, the authoritative tool-call total for a run lives on the run itself rather than being computed client-side from potentially incomplete stage records.

"Done" means: the schema declares the field, every language's contract test passes, all three suites (`bun test`, `go test ./...`, `cargo test`) pass together, and the console table shows a Calls column.

---

## Scope

**In scope:**
- Schema (`packages/contracts/schema/run.schema.json`): add `toolCalls` to properties and required
- TypeScript (`packages/contracts/src/index.ts`): add to `Run` interface and `RUN_FIELDS`
- Checksum (`packages/contracts/schema/run.checksum`): regenerate
- Go (`services/ingest/run.go`): add `ToolCalls int` to `Run` struct with validation
- Seed data (`services/ingest/seed.go`): populate `ToolCalls` for each run (sum of stages)
- Console (`apps/console/app/page.tsx`): add Calls column to the runs table

**Explicitly out of scope:**
- The run detail page (`apps/console/app/runs/[id]/page.tsx`): it already shows per-stage tool call counts; adding a run-level total here is a separate UI concern
- Computed-on-read aggregation: the caller supplies `toolCalls` on POST /runs, matching the pattern of every other run-level aggregate field (`tokensIn`, `tokensOut`, `costMinor`)
- History migration: the in-memory store has no persistence; seed data is updated in the same commit

---

## Phases

### Phase 1 — Schema & contract (TypeScript)

**Changes:**

1. **`packages/contracts/schema/run.schema.json`** — Add `"toolCalls"` to the `required` array (line 8) and a `"toolCalls"` property entry (after line 18):
   - `required` becomes: `["id", "item", "outcome", "startedAt", "endedAt", "tokensIn", "tokensOut", "costMinor", "currency", "toolCalls"]`
   - New property: `"toolCalls": { "type": "integer", "description": "Tool calls the agent made across the whole run" }`

2. **`packages/contracts/src/index.ts`** — Add `toolCalls: number` to the `Run` interface (after line 24) and `'toolCalls'` to `RUN_FIELDS` (line 46)

3. **`packages/contracts/schema/run.checksum`** — Regenerate by running `bun run checksum` in `packages/contracts/`

**Proving it:**
```bash
cd packages/contracts && bun test
```
This runs `contract.test.ts` which asserts:
- `RUN_FIELDS` matches `run.schema.json` properties (line 27-31)
- Every field is in `required` (line 34-37)
- Checksum matches (line 79-81)

The checksum test will fail on first attempt with the message "run `bun run checksum` in packages/contracts and commit the result" — that's expected. The second run (after checksum regeneration) should pass both tests.

---

### Phase 2 — Go struct & ingest validation

**Changes:**

4. **`services/ingest/run.go`** — Add `ToolCalls int \`json:"toolCalls"\`` to the `Run` struct (after line 25). Add `r.ToolCalls < 0` to the negative-count guard in `PutRun` (line 88), so the check becomes:
   ```go
   if r.TokensIn < 0 || r.TokensOut < 0 || r.CostMinor < 0 || r.ToolCalls < 0 {
       return ErrNegativeCount
   }
   ```

5. **`services/ingest/seed.go`** — Add `ToolCalls` to each seed run:
   - run-101: 1+4+17+3+9 = **34**
   - run-102: 1+5+24+6+21 = **57**
   - run-103: 1+2 = **3**
   - run-104: 1+6+52+12+28 = **99**
   - run-105: 1+5+31+9+14 = **60**

**Proving it:**
```bash
cd services/ingest && go test ./...
```

`contract_test.go:TestRunMatchesTheSharedSchema` (line 59-62) asserts the struct's json tags equal the schema's properties — adding `toolCalls` to the struct makes this pass.

`http_test.go:TestAnUnknownFieldIsRejectedRatherThanIgnored` still passes because its test body has no `toolCalls` (Go defaults to 0 for missing int fields, which is valid; the test only checks that `surprise` is rejected).

`run_test.go:aRun()` helper (line 8-14) does NOT need updating because the new field defaults to 0 in Go, which is a valid non-negative value.

---

### Phase 3 — Console display (optional but recommended)

**Changes:**

6. **`apps/console/app/page.tsx`** — Add a `Calls` column header (after line 97, before `Cost`) and a corresponding cell (after line 112, before the cost cell). The cell displays `run.toolCalls.toLocaleString('en')`.

```tsx
<th className="num">Calls</th>   <!-- after line 97 -->
<td className="num">{run.toolCalls.toLocaleString('en')}</td>  <!-- after line 112 -->
```

The console's `Run` type comes from `@ledger/contracts` — adding `toolCalls` to the interface in Phase 1 means `run.toolCalls` is already typed. No other console code changes needed.

**Proving it:**
```bash
cd apps/console && bun run typecheck
```
Also: the console's `ledger.test.ts` uses `Stage` (not `Run`) so it is unaffected.

---

### Phase 4 — Verify all suites together

**Run:**
```bash
cd packages/contracts && bun test          # TS contract tests
cd services/ingest && go test ./...        # Go contract + unit tests
cd services/budget && cargo test           # Rust contract tests (budget.schema.json only, not affected)
```

All three must pass. The Rust suite tests `budget.schema.json` only — it is unaffected by this change but must still be green because the budget depends on the contract.

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Checksum test fails after schema change | Certain (designed this way) | Phase 1 step 3 runs `bun run checksum` — it's a script, not guesswork |
| Go `aRun()` helper in `run_test.go` needs `ToolCalls` set | Low | Go int defaults to 0, which is valid; all existing tests continue to pass |
| `TestAnUnknownFieldIsRejected` breaks because body lacks `toolCalls` | None | Go `DisallowUnknownFields` only rejects *extra* fields, not *missing* fields |
| Budget Rust contract test breaks | None | It only checks `budget.schema.json`, not `run.schema.json` |
| Console type error because `Run` interface changed | Low | Phase 1 updates the interface; Phase 3 only adds a read of `run.toolCalls` which is now typed |

---

## Assumptions

1. **Caller supplies the total** — The caller of POST /runs provides `toolCalls` in the request body, matching the pattern of `tokensIn`, `tokensOut`, `costMinor` (all run-level aggregates supplied by the caller, not computed by the ingest service).
2. **Zero is a valid total** — A run with no tool calls (e.g., a refusal before any tools were called) records `toolCalls: 0`. The requirement is non-negative, not positive.
3. **Go test helper `aRun()` does not need updating** — The new field defaults to 0, which is an acceptable valid value for test runs that don't care about tool calls.
4. **Console tests are unaffected** — `ledger.test.ts` tests `waterfall()`, `slowestStage()`, and `humanMs()`, none of which touch the `Run` interface.
5. **Rust budget tests are unaffected** — They only scan `budget.schema.json`, so changing `run.schema.json` does not touch them.

---

## Open questions

None. Every design decision was resolved from codebase patterns and conventions.