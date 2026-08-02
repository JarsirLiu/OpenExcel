# OpenExcel

<p align="center">
  <img src="packages/web/public/assets/openexcel-logo.svg" alt="OpenExcel logo" width="112" />
</p>

<p align="center"><strong>AI-native spreadsheet workbench for importing, editing, charting, and formula-driven workflows.</strong></p>

<p align="center"><a href="README.zh-CN.md">中文</a> · <a href="https://github.com/JarsirLiu/OpenExcel">GitHub</a> · <a href="https://github.com/JarsirLiu/OpenExcel/issues">Issues</a></p>

<p align="center">
  <a href="https://github.com/JarsirLiu/OpenExcel/actions/workflows/ci.yml"><img src="https://github.com/JarsirLiu/OpenExcel/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <img src="https://img.shields.io/badge/version-0.1.0-5b8def.svg" alt="Version 0.1.0" />
  <a href="https://github.com/JarsirLiu/OpenExcel/stargazers"><img src="https://img.shields.io/github/stars/JarsirLiu/OpenExcel?style=flat" alt="GitHub stars" /></a>
  <img src="https://img.shields.io/badge/contributions-welcome-2ea44f.svg" alt="Contributions welcome" />
  <img src="https://img.shields.io/badge/license-not%20published-lightgrey.svg" alt="License not published" />
</p>

https://github.com/user-attachments/assets/327c10d1-8f9d-45d7-937d-031553be58dc

OpenExcel keeps the spreadsheet grid people already know and adds an AI workspace beside it. Import a workbook, describe the change in natural language, review the result, and export the workbook when it is ready.

> Early-stage project: the current repository is actively evolving. The capabilities below are based on the current code and replay demos, not a future product plan.

## What it does today

| Workflow | Current capability |
| --- | --- |
| Workspaces | Create and manage workspaces, workbooks, and sessions |
| Excel files | Import supported XLSX/XLS/CSV content and export XLSX workbooks |
| Spreadsheet editing | Read, write, clear, and inspect cell ranges with formula-aware operations |
| Charts | Create, list, update, delete, and render persisted charts |
| AI interaction | Ask for workbook changes through a natural-language chat loop |
| Safe review | Show tool progress, bounded previews, structured failures, and undo checkpoints |
| Product demos | Browse read-only replay scenarios from the built-in Examples catalog |

Example request:

```text
Create a monthly sales chart from the Sales sheet and add a margin formula for each row.
```

The AI can translate that intent into spreadsheet and chart operations. You still own the final review before exporting or sharing the workbook.

## Why OpenExcel

| Manual spreadsheet workflow | OpenExcel workflow |
| --- | --- |
| Search for the right sheet and range | Ask for the outcome in plain language |
| Hand-write repeated formulas | Generate a relative formula pattern across a range |
| Build a chart through several dialogs | Describe the chart and its source range |
| Recheck every changed cell manually | Review bounded change previews and tool results |
| Keep the workbook and explanation separate | Keep the workbook and AI conversation in one workspace |

## Quick start: local development

Requirements: Node.js 22+, pnpm 10.20.0, and an OpenAI-compatible model API endpoint.

```powershell
pnpm install
cp .env.example .env
pnpm dev
```

Set these values in `.env` before using chat or AI title generation:

```env
MODEL_BASE_URL=https://your-model-endpoint.example/v1
MODEL_API_KEY=your-api-key
MODEL_NAME=your-model-name
```

Open:

- Web app: `http://localhost:5173`
- API: `http://localhost:4000`
- Health check: `http://localhost:4000/api/health`
- Built-in examples: `http://localhost:5173/demos`

## Local production-like run

There are two different meanings of “local production” in this repository:

1. `pnpm dev` runs Vite and the Fastify server separately with a development proxy.
2. Docker Compose runs the built Web app and the Fastify server together, with SQLite and persistent storage.

The recommended production-like local run is:

```powershell
cp .env.example .env
docker compose up -d --build
docker compose ps
```

Then open `http://127.0.0.1:4000`. The container serves the built frontend from Fastify, runs database migrations at startup, and persists SQLite data and uploaded files in the `openexcel-data` volume.

For a non-Docker smoke test:

```bash
pnpm prod
```

`pnpm preview` is only a Vite frontend preview. It is not a complete production run because it does not start the API server or database.

See [docs/current/docker-deployment.md](docs/current/docker-deployment.md) for image publishing, PostgreSQL notes, backups, and server deployment.

## Common commands

```bash
pnpm dev          # Start Web + Server in development mode
pnpm prod         # Build Web, prepare the database, and start the server
pnpm build        # Build the Web app
pnpm typecheck    # Typecheck all packages
pnpm test         # Run the test suites
pnpm test:web     # Run Web tests
pnpm test:server  # Run Server tests
pnpm test:core    # Run Core tests
pnpm db:prepare   # Generate Prisma Client and apply migrations
```

## Architecture

```text
Web (React/Vite)
       │ HTTP + NDJSON event stream
       ▼
Server (Fastify + Prisma) ───► SQLite / PostgreSQL
       │ concrete workbook, sheet, and chart tools
       ▼
Agent runtime (model loop, events, retries, context)
       │
       ▼
Core (Excel import/export, sheet mutations, chart contracts)
```

The monorepo packages are intentionally separated:

- `packages/web` owns the browser UI, editor, charts, chat, and user interaction.
- `packages/server` owns HTTP, authorization, persistence, sessions, and concrete tool execution.
- `packages/agent` owns the model loop, context, events, retries, and tool adaptation.
- `packages/core` owns spreadsheet primitives, Excel conversion, chart models, and tool contracts.

## Roadmap

This is a proposed public roadmap, not a description of already-implemented behavior:

- [x] Workspaces, workbooks, sheets, import/export, charts, and AI chat loop
- [x] Read-only replay examples for product discovery
- [x] Docker-based local production profile
- [x] Replace the placeholder with a real end-to-end capture
- [ ] Add a repository license and publish a first stable release
- [ ] Add measured workflow benchmarks instead of illustrative time savings
- [ ] Document production hardening, backups, observability, and deployment profiles
- [ ] Improve multi-instance deployment guidance for PostgreSQL

## Contributing

Issues and pull requests are welcome. Before changing code, read [docs/README.md](docs/README.md), the relevant `docs/current/` and `docs/rules/` files, and the nearest package `AGENTS.md`.

Use Conventional Commits, keep tests next to the behavior they protect, and run `pnpm check` plus the affected test suite before opening a pull request.

## License

No license file has been published yet. Until a license is added, do not assume that the repository grants permission to redistribute or use the code commercially.
