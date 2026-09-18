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

This repository is a [software factory](https://github.com/learnwithparam/software-factory) target.
Most changes are written by automated agents, and every pull request is reviewed by a person before
it merges.

To propose a change:

1. **Fork the repository** and create a feature branch.
2. **Set up** — `bun install` from the repository root.
3. **Check what you may change.** The [`.factory/README.md`](.factory/README.md) and
   [`.factory/targets.json`](.factory/targets.json) declare which paths an agent may change
   unattended, and which require a person. Human contributors can change anything, but the target
   map is a useful guide to what each part of the repository does.
4. **Make focused changes.** Keep each pull request to one area — the contract, one service, or the
   console. A change that reaches several areas must update each side of the shared schema (see
   [AGENTS.md](AGENTS.md) for the pinned-schema rule).
5. **Run the checks** for every area your change touches, using the commands listed in the
   [Checks](#checks) section above. The factory only runs tests for the paths a change reaches, so
   running the full suite yourself is unnecessary.
6. **Open a pull request** against the `main` branch. A human will review it before it merges.

See [AGENTS.md](AGENTS.md) for the full rules automated agents follow when working here.

## License

[MIT](LICENSE)
