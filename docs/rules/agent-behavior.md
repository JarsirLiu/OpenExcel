# Agent Behavior Rules

> Status: Rule
>
> This document describes how an AI agent should make engineering decisions in
> OpenExcel. It is not a description of runtime behavior. Runtime facts belong
> under `docs/current/`.

## Authority and priorities

Apply instructions in this order:

1. The user's explicit request and the current task scope.
2. The applicable root or package `AGENTS.md`.
3. The rules in this document and the other applicable files under `docs/rules/`.
4. Current source code and tests as evidence of existing behavior.
5. Design, proposal, and issue documents only when the task explicitly requires them.

An explicit developer correction overrides a general preference for the current
task. Do not silently turn a one-off correction into a permanent rule.

## Before changing code

- Read the repository documentation entrypoint and the nearest applicable `AGENTS.md`.
- Identify the package, module, state owner, and public boundary responsible for the change.
- Search for existing implementations, tests, and related contracts before adding a new abstraction.
- Separate current behavior from proposed behavior. Confirm uncertain claims against source code and tests.
- State a meaningful assumption when the task leaves an implementation choice open.

## Engineering judgment

- Prefer the smallest complete change that solves the requested problem.
- Follow existing package boundaries, naming, module shape, and local patterns.
- Reuse an existing owner, source of truth, conversion rule, or command boundary instead of creating a parallel one.
- Add an abstraction only when it removes real duplication, protects a meaningful boundary, or matches an established pattern.
- Preserve existing behavior unless the task explicitly asks for a behavior change.
- Do not add speculative APIs, state stores, compatibility branches, or framework layers without a current caller and a clear ownership reason.
- Keep unrelated cleanup, formatting churn, and metadata changes out of the task.
- Treat authorization, persistence, idempotency, ordering, cancellation, stale responses, and recovery as behavior that requires explicit reasoning and tests.

## Code quality and style

- Match the surrounding TypeScript ESM style: small focused modules, explicit exports, normal top-level imports, and existing naming conventions.
- Prefer precise types and existing schemas. Use `any` only when the external or runtime boundary genuinely requires it.
- Keep domain rules in the owning domain package and keep adapters thin.
- Do not hide a broken boundary with a full reload, duplicated state, broad query, fallback branch, or unchecked cast.
- Comments should explain a non-obvious decision or invariant, not narrate straightforward code.
- Keep tests close to the behavior they protect and focus them on observable contracts and failure modes.
- Use English for new or modified comments and docstrings. Put new user-visible
  copy in the Web i18n resources and use stable error codes plus parameters at
  non-UI boundaries. Follow [the i18n rule](i18n.md); migrate legacy strings
  incrementally when touching a file.

## Scope and safety

- Do not remove intentional functionality or files outside the task scope without explicit confirmation.
- Do not edit generated output, dependency directories, or generated Prisma clients.
- Do not commit, push, publish, or create external coordination unless explicitly authorized.
- When a requested deletion is destructive, verify the exact target and whether it is still referenced before deleting it.
- When a change crosses package boundaries or changes a public contract, update the corresponding current documentation and tests.

## Documentation behavior

- Write repository documentation in English.
- Put implemented facts in `docs/current/` and mandatory constraints in `docs/rules/`.
- Put incomplete designs and future work in `docs/design/` or `docs/proposals/`, with an explicit status.
- Keep `docs/issues/` as problem records, not as implementation instructions.
- Do not preserve stale documentation merely for volume. Delete a replaced document when it has no required historical value and remove its active references.
- Keep indexes short, task-oriented, and linked to the source of truth rather than duplicating detailed specifications.

## Verification behavior

Choose verification in proportion to the changed surface:

- Documentation-only changes: validate local Markdown links, stale path references, and `git diff --check`.
- Focused source changes: run the affected package tests and typecheck.
- Cross-package, contract, persistence, runtime, or user-facing changes: expand to the repository checks required by `docs/rules/change-workflow.md`.
- UI or layout changes: include manual checks for the affected workflows and viewport states.
- Report checks that were not run. Do not claim a source check is relevant when the source graph was not changed.

## Feedback promotion

When the developer corrects an implementation or decision:

1. Apply the correction to the current task immediately.
2. Decide whether it is task-specific, package-specific, or repository-wide.
3. If the developer explicitly generalizes it, add a concise confirmed rule in the appropriate document.
4. If the same type of correction recurs, propose a candidate rule at the end of this document for confirmation.
5. Record the rule, not the conversation transcript. Include a short rationale and a good/bad example only when they improve future decisions.
6. Remove or revise rules that conflict with newer explicit developer direction.

### Pending rules

There are currently no pending rules. Add candidates here only when a repeated
or clearly generalizable developer correction needs confirmation.
