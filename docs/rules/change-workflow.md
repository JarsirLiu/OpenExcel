# Change Workflow

> Status: Rule

## Before editing

1. Read the root `AGENTS.md` and [docs/README.md](../README.md).
2. Use the [repository map](../repository-map.md) to identify the owning package and code entrypoint.
3. Read the nearest package `AGENTS.md` and the relevant `current/` and `rules/` documents.
4. Search the existing implementation and co-located tests before introducing a new capability.

## While editing

- Keep changes inside the package and module that own the responsibility.
- Do not use future plans to explain current code or describe unimplemented behavior in `docs/current/`.
- Update the affected current documentation when changing package boundaries, APIs, schemas, events, tool contracts, or resource boundaries.
- Database schema changes require a migration. Do not edit generated clients.
- Do not remove functionality that appears intentional unless the task explicitly requests it and the related tests and documentation are updated.

## Verification

For source changes, use the narrowest relevant checks first and expand them
according to risk:

```bash
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

For documentation-only changes, TypeScript, tests, and builds are not required
because the source graph is unchanged. Validate Markdown links and repository
path references, inspect the diff, and run `git diff --check`. Run source checks
only when the documentation change also changes generated files, configuration,
code examples that are compiled, or another source contract.

For database changes, run `pnpm db:prepare` before the relevant checks. Do not
start a long-running development server unless the task needs it.

## Documentation rules

- Document behavior implemented by current code in `docs/current/`.
- Document mandatory current constraints in `docs/rules/`.
- Put unfinished work in `docs/design/` or `docs/proposals/` and mark its `Status`.
- Delete documents that are fully replaced and no longer useful. Do not keep obsolete material in the default documentation tree.
- Use `docs/issues/` for problem records, not implementation rules.
