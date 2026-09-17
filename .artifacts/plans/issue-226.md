# Plan: Add `toolCalls` to Run schema (issue #226)

## Goal

Add `toolCalls` as a required integer field to the `Run` schema, TypeScript interface,
Go struct, and console display — matching what `Stage` already has — so the run list
page shows total tool calls per run without computing them from stages on every render.

**Done means**:
- `packages/contracts` → `bun test` passes
- `services/ingest` → `go test ./...` passes
- `apps/console` → `tsc --noEmit` passes
- Budget service → `cargo test` still passes (no `Run` struct there, just a no-breakage check)

## Scope

**In**:
1. JSON schema: add `toolCalls: integer` to `run.schema.json` properties and required list
2. TypeScript: add `toolCalls: number` to `Run` interface, add `'toolCalls'` to `RUN_FIELDS`
3. Go struct: add `ToolCalls int \`json:"toolCalls"\`` to `Run` struct
4. Go validation: reject negative `ToolCalls` in `PutRun`
5. Go `AddStage`: recompute the run-level total from stages on every stage add
6. Go tests: update `aRun()` helper, verify auto-computation
7. Console tests: update `budget.test.ts` `run()` helper
8. Console list page: add "Calls" column to the runs table
9. Console detail page: add tool call count to the run header

**Out**:
- No change to the budget service (`services/budget`) — Rust has no `Run` struct
- No new HTTP endpoints or fields in POST bodies — auto-computed server-side
- No schema-level backward-compat shims — this is a required field, matching existing pattern

## Phases

### Phase A — Contracts (schema + TypeScript)

**Files**:

1. `packages/contracts/schema/run.schema.json`
   - Add `"toolCalls"` to the `required` array (between `"tokensOut"` and `"costMinor"`)
   - Add to `properties`:
     ```json
     "toolCalls": { "type": "integer", "description": "Tool calls the agent made across the whole run" }
     ```

2. `packages/contracts/src/index.ts`
   - Add `toolCalls: number` to the `Run` interface
   - Add `'toolCalls'` to the `RUN_FIELDS` array

3. `apps/console/lib/budget.test.ts`
   - Add `toolCalls: 0` to the `run()` helper function

**Verification**:
```bash
cd packages/contracts && bun test
```

### Phase B — Go service

**Files**:

1. `services/ingest/run.go`
   - Add `ToolCalls int \`json:"toolCalls"\`` to the `Run` struct (between `TokensOut` and `CostMinor`)
   - Add `r.ToolCalls < 0` to the `PutRun` negative-count check
   - In `AddStage`, after appending the stage, recompute and update the run's total:
     ```go
     total := 0
     for _, stage := range s.stages[st.RunID] {
         total += stage.ToolCalls
     }
     r := s.runs[st.RunID]
     r.ToolCalls = total
     s.runs[st.RunID] = r
     ```

2. `services/ingest/run_test.go`
   - Add `ToolCalls: 0` to the `aRun()` helper

**Verification**:
```bash
cd services/ingest && go test ./...
```

### Phase C — Console display

**Files**:

1. `apps/console/app/page.tsx`
   - Add `<th className="num">Calls</th>` after the Tokens `<th>`
   - Add `<td className="num">{run.toolCalls.toLocaleString('en')}</td>` after the Tokens `<td>`

2. `apps/console/app/runs/[id]/page.tsx`
   - Replace `{formatMinor(run.costMinor, run.currency)}, {(run.tokensIn + run.tokensOut).toLocaleString('en')} tokens.`
     with `{formatMinor(run.costMinor, run.currency)}, {run.toolCalls} calls, {(run.tokensIn + run.tokensOut).toLocaleString('en')} tokens.`

**Verification**:
```bash
cd apps/console && tsc --noEmit
```

### Final verification

Run all three suites to confirm nothing regressed:

```bash
cd packages/contracts && bun test
cd services/ingest && go test ./...
cd apps/console && tsc --noEmit
# Budget service — just check it still compiles (no Run struct change needed)
cd services/budget && cargo test
```

## Risks

| Risk | Mitigation |
|---|---|
| `TestAnUnknownFieldIsRejectedRatherThanIgnored` fails because body now has `toolCalls` as a known field | **No change needed** — the test body sends `surprise` which is not in the struct; `DisallowUnknownFields` still rejects it. `toolCalls` defaults to 0 silently. |
| `TestOneRunCarriesItsStages` fails because Run now has `ToolCalls: 0` from auto-computation | **No change needed** — the test only asserts `Stages[0].Name`, not run fields. Auto-computed `ToolCalls` value is correct (sum of stages). |
| Seed data shows `ToolCalls: 0` even though stages have totals | **By design** — `AddStage` recomputes the run total, so seed runs get correct values. Verified by the run list test which calls `Seed()`. |
| Console page width regression from adding column | The `num` class is already used for Took, Tokens, Cost — adding Calls follows the same pattern. |

## Assumptions

1. **Run-level `toolCalls` is auto-computed from stages in `AddStage`**. The API never receives `toolCalls` directly in a POST body — the ingest service maintains it. This prevents inconsistency and means seed data doesn't need manual totals.
2. **Seed data gets correct totals automatically** because `Seed()` adds stages via `AddStage`, which recomputes the run total after each stage add.
3. **Existing HTTP unknown-field test is unaffected** — the test body posts a `surprise` field without `toolCalls`; Go's `DisallowUnknownFields` still rejects `surprise`, and `toolCalls` decodes to 0 silently.
4. **PR #172's `AddStage` recomputation order is correct** — stages are stored *then* total is recomputed, so the new stage is included in the sum.
5. **Budget service (`services/budget`) has no `Run` struct** — confirmed by reading `budget/tests/contract.rs`. `cargo test` is a no-breakage check only.
6. **The ordering of fields in the struct follows the existing convention** — `ToolCalls` goes between `TokensOut` and `CostMinor`, matching the schema property order.

## Open questions

None. All design decisions are answerable from code, history, and convention.