# .factory

Everything a software factory needs to know about this repository, owned by the people who own the
repository.

The factory itself knows nothing about this codebase. It reads this directory and acts on what it
finds. Point the same factory at a different repository with a different `.factory` and it behaves
differently, which is the only way a factory is worth having.

| File | What it decides |
|---|---|
| `charter.md` | What an agent may attempt here without asking, and what it must never touch |
| `targets.json` | Who owns which paths, what checks them, and how much freedom they get |
| `skills/*.md` | Procedures worth reusing in this codebase, kept out of one-off prompts |

## Who owns what

This directory belongs to the repository's maintainers, not to the factory and not to an agent.
`charter.md` and `targets.json` are both on the protected list inside `charter.md`, which is
deliberately circular: limits an agent can edit are not limits.

## Adding it to your own repository

```bash
bunx @learnwithparam/software-factory init .
```

That writes a starting `charter.md` you must edit, a `targets.json` guessed from your directory
layout, and no skills. It refuses to guess autonomy levels, because the whole point of the charter
is that a person decided them.
