import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { migrateSelectedDatabase } from "../src/infra/database/prismaDatabase.js";
import { prisma } from "../src/infra/database/db.js";
import { withDatabaseWriteLock } from "../src/infra/database/databaseConcurrency.js";
import { executeSheetCommand } from "../src/modules/sheets/application/executeSheetCommand.js";

const pattern = process.env.BENCH_PATTERN === "contiguous-range" ? "contiguous-range" : "single-cell";
const operationsPerWorker = Number(process.env.BENCH_OPERATIONS ?? (pattern === "single-cell" ? 50 : 10));
const levels = (process.env.BENCH_CONCURRENCY ?? "1,2,4,8,16,32")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0);

type Mode = "separate-sheets" | "same-sheet";

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!;
}

function formatMs(value: number): string {
  return `${value.toFixed(1)}ms`;
}

async function createFixture(workerCount: number) {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      email: `bench-${suffix}@example.com`,
      displayName: "Database Benchmark",
      passwordHash: "benchmark",
      workspaces: {
        create: { publicId: `bench-${suffix}`, name: "Database Benchmark", order: 0 },
      },
    },
    include: { workspaces: true },
  });
  const workspaceId = user.workspaces[0]!.id;
  const workbook = await prisma.workbook.create({
    data: { publicId: `bench-${suffix}-workbook`, workspaceId, name: "Benchmark", order: 0 },
  });
  const sheets = await Promise.all(
    Array.from({ length: workerCount }, (_, index) =>
      prisma.sheet.create({
        data: {
          workbookId: workbook.id,
          sheetNo: index + 1,
          name: `Sheet${index + 1}`,
          order: index,
          columns: "[]",
        },
      }),
    ),
  );
  return { workspaceId, sheets };
}

async function runWorker(
  workspaceId: number,
  sheetId: number,
  workerId: number,
  mode: Mode,
  timings: number[],
  errors: { count: number; conflicts: number },
) {
  let revision = 0;
  for (let index = 0; index < operationsPerWorker; index += 1) {
    const started = performance.now();
    let attempts = 0;
    while (true) {
      attempts += 1;
      try {
        const startRow = index * (pattern === "contiguous-range" ? 32 : 1) + 1;
        const startCol = (workerId % 16) * (pattern === "contiguous-range" ? 8 : 1) + 1;
        const endRow = startRow + (pattern === "contiguous-range" ? 31 : 0);
        const endCol = startCol + (pattern === "contiguous-range" ? 7 : 0);
        const result = await withDatabaseWriteLock(() =>
          executeSheetCommand(workspaceId, {
            kind: "mutation",
            mutationId: `bench-${pattern}-${mode}-${workerId}-${index}-${attempts}`,
            sheetId,
            baseRevision: revision,
            mutation: {
              type: "write",
              operations: [
                {
                  type: "range",
                  startRow,
                  startCol,
                  endRow,
                  endCol,
                  value: `value-${workerId}-${index}`,
                },
              ],
            },
          }),
        );
        revision = result.result.revision;
        timings.push(performance.now() - started);
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (mode === "same-sheet" && message.includes("已被其他操作修改") && attempts < 100) {
          errors.conflicts += 1;
          const current = await prisma.sheet.findUnique({
            where: { id: sheetId },
            select: { revision: true },
          });
          if (current) revision = current.revision;
          continue;
        }
        errors.count += 1;
        break;
      }
    }
  }
}

async function runScenario(mode: Mode, concurrency: number) {
  const fixture = await createFixture(mode === "separate-sheets" ? concurrency : 1);
  const timings: number[] = [];
  const errors = { count: 0, conflicts: 0 };
  const started = performance.now();
  await Promise.all(
    Array.from({ length: concurrency }, (_, workerId) =>
      runWorker(
        fixture.workspaceId,
        mode === "separate-sheets" ? fixture.sheets[workerId]!.id : fixture.sheets[0]!.id,
        workerId,
        mode,
        timings,
        errors,
      ),
    ),
  );
  const elapsed = performance.now() - started;
  const total = concurrency * operationsPerWorker;
  console.log(
    `${mode} concurrency=${concurrency} total=${total} success=${timings.length} errors=${errors.count} conflicts=${errors.conflicts} throughput=${(timings.length / (elapsed / 1000)).toFixed(1)}/s p50=${formatMs(percentile(timings, 0.5))} p95=${formatMs(percentile(timings, 0.95))} p99=${formatMs(percentile(timings, 0.99))} elapsed=${formatMs(elapsed)}`,
  );
}

try {
  migrateSelectedDatabase();
  console.log(
    `provider=${process.env.DATABASE_PROVIDER ?? "sqlite"} pattern=${pattern} operationsPerWorker=${operationsPerWorker} levels=${levels.join(",")}`,
  );
  for (const mode of ["separate-sheets", "same-sheet"] as const) {
    for (const concurrency of levels) await runScenario(mode, concurrency);
  }
} finally {
  await prisma.$disconnect();
}
