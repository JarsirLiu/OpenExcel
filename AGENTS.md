# Repository Guidelines

## Project Structure & Module Organization
OpenExcel is a pnpm monorepo. Main packages live under `packages/`:
- `packages/web` - React/Vite UI, workbook editor, and chat composer
- `packages/server` - Fastify API, Prisma persistence, workbook/session orchestration
- `packages/core` - shared spreadsheet primitives and Excel conversion logic
- `packages/agent` - model/tooling and chat session utilities

Keep feature code inside the owning package’s `src/` tree. Avoid generated output such as `dist/` or `node_modules/`. For architecture changes, update `docs/architecture.md` and read package-specific guides like `packages/server/AGENTS.md` before touching server code.

## Build, Test, and Development Commands
- `pnpm dev` - run web and server in parallel
- `pnpm build` - typecheck and build the web app
- `pnpm test` - run tests across all packages
- `pnpm test:web`, `pnpm test:server`, `pnpm test:core` - run one package’s test suite
- `pnpm db:migrate` - apply the server database migrations

## Coding Style & Naming Conventions
This repo uses TypeScript ESM. Follow the existing style: 2-space indentation, small modules, explicit exports/imports, `PascalCase` for components, and `camelCase` for functions and variables.

## Testing Guidelines
Tests use Vitest. Prefer focused tests next to the code they cover, for example `*.test.ts` or `*.test.tsx`. When changing workbook behavior, test the affected module first, then widen if needed.

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
