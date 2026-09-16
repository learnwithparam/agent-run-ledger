# Plan: Add a Contributing section to the README

## Goal

Append a `## Contributing` section to `README.md` that explains how to propose a change — fork, branch, run relevant checks, and open a pull request — using only commands the project already documents.

## Scope

### In

- `README.md` — a single new section appended after `## License` and before the license link.

### Out

- Any other file.
- New commands, scripts, or tooling.
- Changes to `.factory/` contents or package.json.

## Changes

### Phase 1 — Append the Contributing section

**File:** `README.md`

Append after the `## License` heading, before `[MIT](LICENSE)`:

```
## Contributing

Contributions are welcome. Here is how to propose a change.

1. Fork the repository.
2. Create a branch named after what you are changing.
3. Make your changes. Keep them focused — one change per pull request.
4. Install dependencies and run the checks your change touches:

   ```bash
   bun install
   (cd packages/contracts && bun test)
   (cd services/ingest && go test ./...)
   (cd services/budget && cargo test)
   (cd apps/console && bun test)
   ```
5. Open a pull request from your branch. A maintainer will review it.

If your change touches more than one area, run the checks in every area it reaches.
```

**Verification:** `README.md` renders correctly with the new section.

## Risks

- The README is in the `repo` target of `.factory/targets.json` with `autonomy: refuse`. Changes must go through a PR — no direct commits. This is by design.

## Assumptions

- The contributing section should follow the existing tone and structure (concise, code-block commands, no unnecessary prose).
- The test commands from the existing README `## Checks` section are the correct commands to reference. The project also supports `bun run --filter '*' typecheck` (from root package.json) but the README does not currently document it, so it is excluded per "do not invent commands the project does not support."
- The section goes after `## License` because that is the last substantive section before the license link, and it reads naturally as the last piece of prose content.

## Open questions

None.