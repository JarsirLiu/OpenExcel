# Repository Guidelines

## Project Structure & Module Organization
OpenExcel is a pnpm monorepo. Main packages live under `packages/`:
- `packages/web` - React/Vite UI, workbook editor, and chat composer
- `packages/server` - Fastify API, Prisma persistence, workbook/session orchestration
- `packages/core` - shared spreadsheet primitives and Excel conversion logic
- `packages/agent` - model/tooling and chat session utilities

Keep feature code inside the owning package’s `src/` tree. Avoid generated output such as `dist/` or `node_modules/`. For package-boundary changes, update `docs/architecture.md`; for Agent loop, context, tool, retry, event, or recovery changes, update `docs/agent-loop.md`. Read package-specific guides like `packages/server/AGENTS.md` before touching server code.

## Build, Test, and Development Commands
- `pnpm dev` - run web and server in parallel
- `pnpm build` - typecheck and build the web app
- `pnpm test` - run tests across all packages
- `pnpm test:web`, `pnpm test:server`, `pnpm test:core` - run one package’s test suite
- `pnpm typecheck` - run TypeScript type checking across all packages
- `pnpm check` - run Biome lint+format + typecheck (same as pre-commit hook)
- `pnpm db:migrate` - apply the server database migrations
- `pnpm changeset` - create a new changeset entry for changelog
- `pnpm version` - apply changesets and bump versions

## Pre-commit Quality Gates
The project uses **Husky** to enforce code quality before every commit:

1. **lint-staged** — runs `biome check --write` only on staged files (format + lint + organize imports)
2. **TypeScript type checking** — runs `tsc --noEmit` across all packages
3. **commitlint** — validates commit messages follow Conventional Commits format

To bypass hooks temporarily: `git commit --no-verify`

## Coding Style & Naming Conventions
This repo uses TypeScript ESM. Follow the existing style: 2-space indentation, small modules, explicit exports/imports, `PascalCase` for components, and `camelCase` for functions and variables.

## Testing Guidelines

See [docs/testing-guidelines.md](docs/testing-guidelines.md) for the full specification.

### Quick Reference
- **Vitest** is the test framework across all packages.
- Test file naming: `*.test.ts` (preferred) or `*.test.tsx` for components.
- Test file placement: **co-located next to the source file** (e.g., `src/modules/sheets/domain.test.ts` for `domain.ts`).
- Cross-cutting integration tests may live in `src/tests/` at the package level.
- Use `describe` / `it` blocks, imported explicitly from `vitest`.
- Outer `describe("ModuleName")`, inner `describe("scenario")`, `it("should do ...")`.
- Use original Vitest matchers: `.toBe()`, `.toEqual()`, `.toContain()`, `.rejects.toThrow()`, etc.
- Prefer hand-rolled mock objects with `vi.fn()` over auto-mocking.
- Use `vi.mock()` + `vi.hoisted()` sparingly, only when module-level mocking is unavoidable.
- Save/restore `process.env` in `try/finally` for env-dependent tests.

### Commands
- `pnpm test` — run all tests across all packages.
- `pnpm test:web`, `pnpm test:server`, `pnpm test:core` — run one package's suite.

## Commit & Pull Request Guidelines
Use **Conventional Commits** for all commits and prefer the same style for PR titles.

Format:
`type(scope): summary`

Examples:
- `feat(workbooks): add workbook-scoped sheet create/delete`
- `fix(web): lazy load reference candidates`

Common `type` values: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `build`, `ci`.

Do not create a commit unless the user explicitly authorizes autonomous committing. By default, prepare the changes and leave committing to the user.

Pull requests should explain what changed, why, and how it was verified. Include screenshots or short recordings for UI work and link related issues when available.

## Working Constraints
- Use `any` only when necessary, and check installed type definitions before guessing an external API shape.
- Prefer normal top-level imports; avoid inline or dynamic imports for types and modules.
- Ask before removing functionality or code that looks intentional.
- Do not create a commit unless the user explicitly authorizes autonomous committing.

## Architecture Notes
Workbook structure belongs in `workbooks`, while sheet content updates belong in `sheets`. Keep those boundaries explicit in code and docs so sheet creation/deletion does not re-enter the incremental cell-update path.
