import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("SheetChunk persistence (SQLite)", () => {
  let databaseDirectory: string | undefined;
  let database: Awaited<typeof import("../../../infra/database/db.js")>;
  let executeSheetCommand: typeof import("./executeSheetCommand.js").executeSheetCommand;
  let workspaceId: number;
  let sheetId: number;
  const originalProvider = process.env.DATABASE_PROVIDER;
  const originalUrl = process.env.DATABASE_URL;
  const testProvider = process.env.SHEET_CHUNK_TEST_PROVIDER ?? "sqlite";

  beforeAll(async () => {
    if (testProvider === "sqlite") {
      databaseDirectory = await mkdtemp(join(tmpdir(), "openexcel-sheet-chunk-"));
      process.env.DATABASE_PROVIDER = "sqlite";
      process.env.DATABASE_URL = `file:${join(databaseDirectory, "sheet-chunk.db")}`;
    } else if (testProvider === "postgresql") {
      process.env.DATABASE_PROVIDER = "postgresql";
      if (!process.env.SHEET_CHUNK_TEST_DATABASE_URL) {
        throw new Error("SHEET_CHUNK_TEST_DATABASE_URL is required for PostgreSQL tests");
      }
      process.env.DATABASE_URL = process.env.SHEET_CHUNK_TEST_DATABASE_URL;
    } else {
      throw new Error(`Unsupported SHEET_CHUNK_TEST_PROVIDER: ${testProvider}`);
    }

    const { migrateSelectedDatabase } = await import("../../../infra/database/prismaDatabase.js");
    migrateSelectedDatabase();
    database = await import("../../../infra/database/db.js");
    ({ executeSheetCommand } = await import("./executeSheetCommand.js"));

    const user = await database.prisma.user.create({
      data: {
        email: "sheet-chunk-test@example.com",
        displayName: "Sheet Chunk Test",
        passwordHash: "test-password-hash",
        workspaces: {
          create: { publicId: "sheet-chunk-workspace", name: "Sheet Chunk Test", order: 0 },
        },
      },
      include: { workspaces: true },
    });
    workspaceId = user.workspaces[0]!.id;
    const workbook = await database.prisma.workbook.create({
      data: { publicId: "sheet-chunk-workbook", workspaceId, name: "Test Workbook", order: 0 },
    });
    const sheet = await database.prisma.sheet.create({
      data: {
        workbookId: workbook.id,
        sheetNo: 1,
        name: "Sheet1",
        order: 0,
        columns: "[]",
      },
    });
    sheetId = sheet.id;
  }, 60_000);

  afterAll(async () => {
    await database.prisma.$disconnect();
    if (databaseDirectory) {
      await rm(databaseDirectory, { recursive: true, force: true });
    }
    if (originalProvider === undefined) delete process.env.DATABASE_PROVIDER;
    else process.env.DATABASE_PROVIDER = originalProvider;
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  }, 60_000);

  it("writes one cell into one chunk and preserves the receipt", async () => {
    const result = await executeSheetCommand(workspaceId, {
      kind: "mutation",
      mutationId: "chunk-write-1",
      sheetId,
      baseRevision: 0,
      mutation: {
        type: "patch",
        cells: [{ row: 1, col: 1, cell: { v: "A1", m: "A1" } }],
      },
    });

    expect(result.outcome).toBe("committed");
    expect(result.result.revision).toBe(1);
    await expect(database.prisma.sheetChunk.count({ where: { sheetId } })).resolves.toBe(1);
    await expect(database.prisma.sheetMutationReceipt.count({ where: { sheetId } })).resolves.toBe(
      1,
    );
  });

  it("updates only the chunks touched by a cross-boundary mutation", async () => {
    const result = await executeSheetCommand(workspaceId, {
      kind: "mutation",
      mutationId: "chunk-write-2",
      sheetId,
      baseRevision: 1,
      mutation: {
        type: "write",
        operations: [
          { type: "range", startRow: 256, startCol: 1, endRow: 257, endCol: 1, value: "boundary" },
        ],
      },
    });

    expect(result.outcome).toBe("committed");
    expect(result.result.revision).toBe(2);
    const chunks = await database.prisma.sheetChunk.findMany({
      where: { sheetId },
      orderBy: [{ chunkRow: "asc" }, { chunkCol: "asc" }],
    });
    expect(chunks.map(({ chunkRow, chunkCol }) => [chunkRow, chunkCol])).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(chunks.every((chunk) => chunk.contentRevision === 2)).toBe(true);
  });

  it("removes an empty chunk when its last cell is cleared", async () => {
    await executeSheetCommand(workspaceId, {
      kind: "mutation",
      mutationId: "chunk-clear-1",
      sheetId,
      baseRevision: 2,
      mutation: {
        type: "patch",
        cells: [{ row: 257, col: 1, cell: null }],
      },
    });

    const chunks = await database.prisma.sheetChunk.findMany({ where: { sheetId } });
    expect(chunks.map(({ chunkRow, chunkCol }) => [chunkRow, chunkCol])).toEqual([[0, 0]]);
  });

  it("rejects a stale revision without changing chunks or receipts", async () => {
    await expect(
      executeSheetCommand(workspaceId, {
        kind: "mutation",
        mutationId: "stale-write-1",
        sheetId,
        baseRevision: 1,
        mutation: {
          type: "patch",
          cells: [{ row: 2, col: 2, cell: { v: "stale", m: "stale" } }],
        },
      }),
    ).rejects.toThrow("已被其他操作修改");

    await expect(database.prisma.sheetChunk.count({ where: { sheetId } })).resolves.toBe(1);
    await expect(database.prisma.sheetMutationReceipt.count({ where: { sheetId } })).resolves.toBe(
      3,
    );
  });

  it("replays the original receipt after the sheet revision advances", async () => {
    const command = {
      kind: "mutation" as const,
      mutationId: "replay-1",
      sheetId,
      baseRevision: 3,
      mutation: {
        type: "patch" as const,
        cells: [{ row: 3, col: 3, cell: { v: "original", m: "original" } }],
      },
    };
    const first = await executeSheetCommand(workspaceId, command);
    await executeSheetCommand(workspaceId, {
      kind: "mutation",
      mutationId: "after-replay-1",
      sheetId,
      baseRevision: 4,
      mutation: {
        type: "patch",
        cells: [{ row: 4, col: 4, cell: { v: "later", m: "later" } }],
      },
    });
    const replay = await executeSheetCommand(workspaceId, command);

    expect(first.outcome).toBe("committed");
    expect(replay.outcome).toBe("replayed");
    expect(replay.result.revision).toBe(4);
    expect(replay.result.baseRevision).toBe(3);
    expect(replay.result.changeSummary).toEqual(first.result.changeSummary);
    expect(replay.result.snapshot).toBeNull();
  });

  it("supports replace-then-patch across chunks", async () => {
    const replaced = await executeSheetCommand(workspaceId, {
      kind: "replaceSnapshot",
      mutationId: "chunk-replace-1",
      sheetId,
      baseRevision: 5,
      snapshot: {
        celldata: [
          { r: 0, c: 0, v: { v: "imported", m: "imported" } },
          { r: 256, c: 256, v: { v: "imported-boundary", m: "imported-boundary" } },
        ],
        config: null,
      },
    });
    expect(replaced.result.revision).toBe(6);

    const patched = await executeSheetCommand(workspaceId, {
      kind: "mutation",
      mutationId: "chunk-import-patch-1",
      sheetId,
      baseRevision: 6,
      mutation: {
        type: "patch",
        cells: [{ row: 257, col: 257, cell: { v: "patched", m: "patched" } }],
      },
    });

    expect(patched.result.revision).toBe(7);
    await expect(database.prisma.sheetChunk.count({ where: { sheetId } })).resolves.toBe(2);
  });

  it("replaces one chunk while preserving recalculated formula cache values", async () => {
    const result = await executeSheetCommand(workspaceId, {
      kind: "replaceChunks",
      mutationId: "chunk-replace-changed-1",
      sheetId,
      baseRevision: 7,
      config: null,
      chunks: [
        {
          chunkRow: 0,
          chunkCol: 0,
          payload: JSON.stringify({
            celldata: [
              { r: 0, c: 0, v: { v: 9, m: "9" } },
              { r: 0, c: 1, v: { v: 9, m: "9", f: "=SUM(A1:A1)" } },
            ],
          }),
        },
      ],
    });

    expect(result.result.revision).toBe(8);
    const chunk = await database.prisma.sheetChunk.findUnique({
      where: { sheetId_chunkRow_chunkCol: { sheetId, chunkRow: 0, chunkCol: 0 } },
    });
    expect(JSON.parse(chunk!.payload).celldata[1].v).toMatchObject({
      v: 9,
      m: "9",
      f: "=SUM(A1:A1)",
    });
  });

  it("clears a huge sparse range without walking empty coordinates", async () => {
    const result = await executeSheetCommand(workspaceId, {
      kind: "mutation",
      mutationId: "chunk-clear-large-1",
      sheetId,
      baseRevision: 8,
      mutation: {
        type: "clear",
        operations: [
          { type: "range", startRow: 1, startCol: 1, endRow: 1_000_000, endCol: 1_000_000 },
        ],
      },
    });

    expect(result.result.revision).toBe(9);
    const remainingChunks = await database.prisma.sheetChunk.findMany({ where: { sheetId } });
    expect(remainingChunks).toHaveLength(1);
    expect(JSON.parse(remainingChunks[0]!.payload).celldata).toEqual([
      { r: 256, c: 256, v: { v: null, m: "", fc: "#000000" } },
    ]);
  });
});
