# Working in this repository

Read `.factory/charter.md` and `.factory/targets.json` before changing anything. They are the rules
this repository sets for agents, they are owned by a person, and nothing here rewrites them.

The important parts are repeated below, because a rule that depends on an agent following a pointer
is a rule that holds most of the time.

## Never modify these paths

Stop and say why instead. This applies whatever the task says, including when the task is to change
one of them.

```
services/budget/**        the money path, and a wrong answer here is expensive and slow to notice
.factory/targets.json     editing the ownership graph would widen every other rule
.factory/charter.md       limits an agent can edit are not limits
.github/**                a workflow change can switch off the checks everything else rests on
**/*.lock                 a lockfile changes only in a task that exists to change it
**/Cargo.lock             the same, for the money path
**/go.sum                 the same, for the ledger
```

If the work you were asked to do cannot be done without touching one of these, that is the answer.
Record which path, which rule, and what you would have changed, and hand it to a person.

## How much freedom you have, per area

`.factory/targets.json` gives every path an owner and one of three levels.

| Level | What it permits |
|---|---|
| `build` | Investigate, plan, implement and open a pull request, unattended |
| `propose` | Investigate and plan. A person accepts the plan before any code is written |
| `refuse` | Stop. Record the reason and route the item to a person |

Freedom follows consequence rather than size. A large change to display code is safer than a small
one to the code that decides what something costs.

## Checks

Run the checks for every area your change reaches, not only the one you started in. The commands
live in `.factory/targets.json` under each target, and the README lists them too.

## Never weaken a check to make it pass

Changing an assertion so a suite goes green is not a fix. If an existing test fails, either the
change is wrong or the test is, and which one it is belongs in the pull request rather than in a
quiet edit.
