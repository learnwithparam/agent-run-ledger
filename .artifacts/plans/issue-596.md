# Plan: Warn earlier when spend is heading for the limit

**Issue**: [#596](https://github.com/learnwithparam/agent-run-ledger/issues/596)
**Route**: Await approval (the money path — `services/budget` has `autonomy: refuse`)

---

## Goal

Lower the warning threshold from 80% to 70% of the monthly limit so teams see a `Warning` state earlier, giving them more time to react before spend reaches a `Breached` state. Done means: `WARNING_PERCENT` is 70, the library tests assert the new boundary, and all 11 budget tests pass.

## Scope

**In**:
- `services/budget/src/lib.rs` — change `WARNING_PERCENT` from 80 to 70 (one constant)
- `services/budget/tests/budget.rs` — update two test functions to assert the 70% boundary

**Out**:
- No console changes (the console shells out to the Rust binary; it has no threshold logic)
- No schema changes (the state enum `under` / `warning` / `breached` is unchanged)
- No CLI changes (the `budget-cli` binary already accepts the same arguments)
- No config (the threshold stays a compile-time constant — the issue just asks to move it)

## Phases

### Phase 1 — Change the constant

**File**: `services/budget/src/lib.rs`, line 71

Change:
```rust
const WARNING_PERCENT: i64 = 80;
```
to:
```rust
const WARNING_PERCENT: i64 = 70;
```

**Verification**: `cargo check --quiet` passes.

### Phase 2 — Update the threshold tests

**File**: `services/budget/tests/budget.rs`

Two test functions assert the old 80% boundary:

1. `the_warning_starts_exactly_at_eighty_percent` (line 16) — rename to `the_warning_starts_exactly_at_seventy_percent`, update assertions:
   - `state_for(34_999, 50_000) == State::Under` (below 70% of 50,000 = 35,000)
   - `state_for(35_000, 50_000) == State::Warning` (exactly 70%)
   - `state_for(49_999, 50_000) == State::Warning` (still below limit)

2. `the_threshold_holds_on_a_limit_that_does_not_divide_evenly` (line 29) — update assertions:
   - 70% of 333 is 233.1, so `state_for(233, 333) == State::Under`
   - `state_for(234, 333) == State::Warning`

**Verification**: `cargo test --quiet` passes all 11 tests.

### Phase 3 — Full verification

```bash
cd services/budget && cargo test --quiet
cd services/budget && cargo check --quiet
```

Expected: 11 passed, 0 failed.

## Risks

| Risk | Likelihood | Detection |
|---|---|---|
| Arithmetic overflow on `spent_minor * 100` when `spent_minor` >= 2^63/100 | Very low (monthly budgets don't reach 9 × 10^16 minor units) | Already existed before this change; unchanged by it |
| Test boundary off-by-one at the new threshold | Low | Each test asserts both sides of the boundary; the invariant test (`spent_plus_remaining_always_equals_the_limit`) catches drift in the other tests' spend values |

## Assumptions

1. **Threshold value is 70%** — PR #319 (approved by Param-Harrison, Sep 17) used 70%. No reason has emerged to pick a different number.
2. **The console needs no changes** — confirmed: `apps/console/lib/budget.ts` has zero threshold logic; it only shells out to the Rust binary. `BudgetChip` in `state.tsx` maps the three state strings to CSS classes and doesn't reference the threshold.
3. **The `spent_plus_remaining_always_equals_the_limit` test doesn't need new spend values** — its values (0, 1, 4_999, 5_000, 39_999, 40_000, 49_999, 50_000, 73_000) already cover the relevant range before and after the change. It continues to verify the invariant.
4. **No schema change needed** — the `State` enum (Under, Warning, Breached) and the JSON schema `budget.schema.json` stay identical. `every_state_the_schema_allows_is_a_state_we_can_produce` in `contract.rs` is unaffected.
5. **Test renaming is a local concern** — renaming `the_warning_starts_exactly_at_eighty_percent` to `the_warning_starts_exactly_at_seventy_percent` has no effect on any other file (Rust tests are matched by test runner, not by name).
6. **The previous test values (39_999/40_000) won't collide with the invariant test** — the invariant test at `spent_plus_remaining_always_equals_the_limit` uses `state_for` indirectly through `assess()`, which calls `state_for`. It's already independent of the threshold value — it only checks the `spent + remaining == limit` property.

## Open questions

None — every dimension of this change is answerable from the codebase's structure, history, and conventions.