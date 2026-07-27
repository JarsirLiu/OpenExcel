import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("checkpointRepository (SQLite)", () => {
  let databasePath: string;
  let databaseDirectory: string;
  let database: Awaited<typeof import("../../../infra/database/db.js")>;
  let repository: typeof import("./checkpointRepository.js");

  beforeAll(async () => {
    databaseDirectory = await mkdtemp(join(tmpdir(), "openexcel-checkpoint-"));
    databasePath = join(databaseDirectory, "checkpoint.db");
    process.env.DATABASE_PROVIDER = "sqlite";
    process.env.DATABASE_URL = `file:${databasePath}`;

    database = await import("../../../infra/database/db.js");
    repository = await import("./checkpointRepository.js");
    await database.prisma.$executeRawUnsafe(`
      CREATE TABLE "AgentRun" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "status" TEXT NOT NULL,
        "lastEventSequence" INTEGER NOT NULL DEFAULT -1
      );
    `);
    await database.prisma.$executeRawUnsafe(`
      CREATE TABLE "AgentRunCheckpoint" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "runId" INTEGER NOT NULL UNIQUE,
        "checkpointSequence" INTEGER NOT NULL,
        "transcript" TEXT NOT NULL,
        "reasoning" TEXT NOT NULL,
        "toolState" TEXT NOT NULL,
        "contextCheckpoint" TEXT,
        "contextVersion" INTEGER,
        "updatedAt" DATETIME NOT NULL,
        FOREIGN KEY ("runId") REFERENCES "AgentRun" ("id") ON DELETE CASCADE
      );
    `);
    await database.prisma.$executeRawUnsafe(
      `INSERT INTO "AgentRun" ("status", "lastEventSequence") VALUES ('running', 4)`,
    );
  });

  afterAll(async () => {
    await database.prisma.$disconnect();
    await rm(databaseDirectory, { recursive: true, force: true });
  });

  it("persists only forward checkpoints and keeps all projected domains", async () => {
    const first = await repository.persistRunCheckpoint({
      runId: 1,
      checkpointSequence: 2,
      transcript: [{ role: "assistant", parts: [{ type: "text", text: "a" }] }],
      reasoning: "thinking",
      toolState: [{ type: "tool.started", payload: { toolCallId: "call-1" } }],
    });
    const stale = await repository.persistRunCheckpoint({
      runId: 1,
      checkpointSequence: 1,
      transcript: [],
      reasoning: "stale",
      toolState: [],
    });

    expect(first).toBe(true);
    expect(stale).toBe(false);
    await expect(repository.findRunCheckpoint(1)).resolves.toEqual({
      runId: 1,
      checkpointSequence: 2,
      transcript: [{ role: "assistant", parts: [{ type: "text", text: "a" }] }],
      reasoning: "thinking",
      toolState: [{ type: "tool.started", payload: { toolCallId: "call-1" } }],
    });
  });

  it("keeps the checkpoint boundary monotonic", async () => {
    await expect(
      repository.persistRunCheckpoint({
        runId: 1,
        checkpointSequence: 4,
        transcript: [],
        reasoning: "",
        toolState: [],
      }),
    ).resolves.toBe(true);
  });
});
