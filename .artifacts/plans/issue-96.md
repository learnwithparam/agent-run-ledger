# Plan: Add a Contributing section to the README

## Goal

Add a `## Contributing` section to `README.md` that explains how to propose a change to this repository, using only commands the project already documents. The section is inserted between the existing `## Checks` and `## License` sections.

## Scope

**In:**
- `README.md` — new Contributing section only.

**Out:**
- No other files changed.
- No new commands, scripts, or automation.
- No changes to `.factory/` configuration, AGENTS.md, or any code.

## Implementation

**File: `README.md`**

Insert a new `## Contributing` section between the `## Checks` block and the `## License` heading. The section covers:

1. **Fork and branch** — standard fork-and-PR workflow.
2. **Set up** — `bun install` (already documented in Running it).
3. **Make changes** — keep changes scoped; consult `.factory/targets.json` for path-level autonomy rules.
4. **Run checks** — area-specific commands from the Checks section.
5. **Open a pull request** — link back to the issue, describe what changed and why.

## Verification

- Unit tests: none affected (docs-only change).
- Type checks: not applicable (docs-only change).
- Manual: `cat README.md` to confirm the new section renders correctly between Checks and License.

## Risks

- None significant. Documentation-only change with no behavioral impact.

## Assumptions

- The section belongs between Checks and License, matching the descending-information-density pattern of the existing README.
- Using `bun install` from the Running section alongside the check commands from the Checks section is appropriate — it makes the contributing section self-contained.

## Open questions

- None. The issue is fully specified.