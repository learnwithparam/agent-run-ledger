# Agent run ledger

What each agent run cost, where its time went, and how it ended.

A small polyglot monorepo. It exists to be worked on: a
[software factory](https://github.com/learnwithparam/software-factory) is pointed at it, takes real
issues, and opens verified pull requests. Everything a factory needs to know about this repository
lives in [`.factory/`](.factory/README.md) and is owned by this repository, not by the factory.

## The pieces

| Path | Language | What it does |
|---|---|---|
| `packages/contracts` | TypeScript | The one definition of a run, a stage and a budget |
| `services/ingest` | Go | Accepts run records and the timed stages inside them |
| `services/budget` | Rust | What a period of work may cost, and where spend stands |
| `apps/console` | Next.js | The pages that show it |

Each language asserts itself against the same JSON schema, so editing the contract goes red in three
suites at once until every side of it is updated. That is deliberate: it is the most useful shape of
change to hand an agent, and the easiest one to get subtly wrong.

The console computes no money. It shells out to the Rust binary that owns those rules, which is why
`services/budget` can be marked off limits and mean something.

## Running it

```bash
bun install
(cd services/ingest && go run ./cmd/server)   # the ledger, on 8081
(cd apps/console && bun run dev)              # the console, on 3070
```

## Checks

There is no single test command on purpose. Each area declares its own in `.factory/targets.json`,
and the factory runs only the ones a change reaches.

```bash
(cd packages/contracts && bun test)
(cd services/ingest && go test ./...)
(cd services/budget && cargo test)
(cd apps/console && bun test)
```

## Contributing

Changes are welcome. Here is how to propose one.

1. **Fork** the repository and create a branch with a descriptive name.
2. **Set up** a development environment (`bun install`).
3. **Make your change.** Only touch files the change calls for.
4. **Check the affected area.** Each area has its own test and type-check commands:

   ```bash
   (cd packages/contracts && bun test && bun x tsc --noEmit)
   (cd services/ingest   && go test ./... && go vet ./...)
   (cd services/budget   && cargo test --quiet && cargo check --quiet)
   (cd apps/console      && bun test && bun x tsc --noEmit)
   ```

5. **Open a pull request.** Tell the reviewer what the change does and why.

Some paths are protected — the [charter](.factory/charter.md) lists them and the reason for each. A
pull request that touches a protected path needs extra scrutiny and may need a plan approved before
any code is written. The same charter explains what finished means and when the factory stops and
asks for help.

Every pull request is reviewed by a person. Nothing merges unattended.

## License

[MIT](LICENSE)
