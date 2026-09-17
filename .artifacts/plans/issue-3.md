# Plan: Show what each run cost in the console

## Goal

The runs table in the console already shows cost per run, and the console suite passes. The feature requested in issue #3 is already implemented — no code changes are needed. This plan documents the verification and closes the issue.

## Verification (completed)

1. **Code review**: `apps/console/app/page.tsx` has a "Cost" column header (line 97) and displays `formatMinor(run.costMinor, run.currency)` per row (line 112).
2. **Run detail page**: `apps/console/app/runs/[id]/page.tsx` shows cost in the lede (line 48).
3. **Data model**: The `Run` interface (`packages/contracts/src/index.ts`) includes `costMinor: number` and `currency: Currency` — both required in the JSON schema (`packages/contracts/schema/run.schema.json`).
4. **Go struct**: `services/ingest/store.go` has `CostMinor int` and `Currency string` with JSON tags.
5. **Seed data**: `services/ingest/seed.go` populates `CostMinor` and `Currency` for every run.
6. **API response**: `GET /runs` returns `costMinor` and `currency` for every run (verified via curl against a running ingest service).
7. **Formatting**: `formatMinor` in `packages/contracts/src/index.ts` correctly formats minor units (e.g., `€2.96`, `€0.74`). Unit tests pass.
8. **Test suite**: Console tests pass (12 pass, 0 fail). Contracts tests pass.

## Scope

- **In**: Verification that the existing implementation satisfies the issue's doneWhen criteria.
- **Out**: No code changes. The cost column already exists and works.

## Phases

### Phase 1: Verify the existing implementation

Completed. All conditions are met:

| Condition | Status |
|---|---|
| Runs table shows a cost per run | ✅ Cost column shows `formatMinor(costMinor, currency)` |
| Cost is actionable (can compare runs) | ✅ Currency symbol and decimal format make costs scannable |
| Console suite passes | ✅ 12 tests pass, 0 fail |

## Risks

None. No code is being changed.

## Assumptions

- The issue was filed before the cost column was added to the runs table. The column already exists in the current codebase.

## Open questions

None.