import { type ModelSafeJsonValue, toModelSafeJsonValue } from "@openexcel/agent";
import { prisma } from "../../../infra/database/db.js";
import type { Prisma } from "../../../infra/database/prismaTypes.js";

type ToolExecutionDatabase = Pick<Prisma.TransactionClient, "agentToolExecution">;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002"
  );
}

export type ToolExecutionClaim = { kind: "execute" } | { kind: "replay"; output: unknown };

export class ToolExecutionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolExecutionConflictError";
  }
}

function serialize(value: unknown): string {
  return serializeJsonValue(toModelSafeJsonValue(value));
}

function serializeJsonValue(value: ModelSafeJsonValue): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(serializeJsonValue).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, ModelSafeJsonValue>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${serializeJsonValue(entry)}`)
      .join(",")}}`;
  }
  throw new Error("Tool execution value is not a model-safe JSON value");
}

function deserialize(value: string): unknown {
  return JSON.parse(value);
}

export async function claimToolExecutionUsing(
  db: ToolExecutionDatabase,
  data: {
    runId: number;
    toolCallId: string;
    toolName: string;
    input: unknown;
    now?: Date;
  },
): Promise<ToolExecutionClaim> {
  const input = serialize(data.input);
  const now = data.now ?? new Date();
  const existing = await db.agentToolExecution.findUnique({
    where: {
      runId_toolCallId: {
        runId: data.runId,
        toolCallId: data.toolCallId,
      },
    },
  });

  if (!existing) {
    try {
      await db.agentToolExecution.create({
        data: {
          runId: data.runId,
          toolCallId: data.toolCallId,
          toolName: data.toolName,
          status: "running",
          input,
          startedAt: now,
        },
      });
      return { kind: "execute" };
    } catch (error) {
      // The unique-key race aborts this transaction; do not query with its client.
      if (isUniqueConstraintError(error)) {
        throw new ToolExecutionConflictError(
          `Tool call ${data.toolCallId} is already claimed by another execution`,
        );
      }
      throw error;
    }
  }

  if (existing.toolName !== data.toolName || existing.input !== input) {
    throw new ToolExecutionConflictError(
      `Tool call ${data.toolCallId} was reused with different input`,
    );
  }

  if (existing.status === "completed") {
    if (existing.output == null) {
      throw new ToolExecutionConflictError(`Completed tool call ${data.toolCallId} has no output`);
    }
    return { kind: "replay", output: deserialize(existing.output) };
  }

  if (existing.status === "running") {
    throw new ToolExecutionConflictError(
      `Tool call ${data.toolCallId} is unresolved and requires recovery`,
    );
  }

  throw new ToolExecutionConflictError(
    `Tool call ${data.toolCallId} has unexpected status ${existing.status}`,
  );
}

export async function claimToolExecution(data: Parameters<typeof claimToolExecutionUsing>[1]) {
  return claimToolExecutionUsing(prisma, data);
}

export async function completeToolExecutionUsing(
  db: ToolExecutionDatabase,
  runId: number,
  toolCallId: string,
  output: unknown,
) {
  return db.agentToolExecution.update({
    where: { runId_toolCallId: { runId, toolCallId } },
    data: {
      status: "completed",
      output: serialize(output),
      errorMessage: null,
      endedAt: new Date(),
    },
  });
}

export async function completeToolExecution(runId: number, toolCallId: string, output: unknown) {
  return completeToolExecutionUsing(prisma, runId, toolCallId, output);
}

export async function failToolExecutionUsing(
  db: ToolExecutionDatabase,
  runId: number,
  toolCallId: string,
  error: unknown,
) {
  return db.agentToolExecution.update({
    where: { runId_toolCallId: { runId, toolCallId } },
    data: {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
      endedAt: new Date(),
    },
  });
}

export async function failToolExecution(runId: number, toolCallId: string, error: unknown) {
  return failToolExecutionUsing(prisma, runId, toolCallId, error);
}
