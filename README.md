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

Changes are proposed through pull requests. The project uses the
[software factory](https://github.com/learnwithparam/software-factory) workflow:

1. Fork this repository.
2. Create a branch for your change.
3. Make your changes. Run the relevant checks from the [Checks](#checks) section above.
4. Open a pull request for review.

Some paths in this repository are governed by rules in
[`.factory/targets.json`](.factory/targets.json) that restrict what an agent may change unattended.
Review those rules before starting work — they exist because a wrong change to certain areas is
expensive to notice.

This project is documented, not automated. Every pull request needs a named engineer to approve it
before it merges.

## License

[MIT](LICENSE)
