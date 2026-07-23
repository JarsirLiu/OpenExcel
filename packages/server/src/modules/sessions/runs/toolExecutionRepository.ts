import { prisma } from "../../../infra/database/db.js";

const STALE_TOOL_EXECUTION_AFTER_MS = 5 * 60 * 1000;

export type ToolExecutionClaim = { kind: "execute" } | { kind: "replay"; output: unknown };

export class ToolExecutionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolExecutionConflictError";
  }
}

function serialize(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(serialize).join(",")}]`;
  if (typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${serialize(entry)}`)
      .join(",")}}`;
  }
  throw new Error("Tool execution value is not JSON serializable");
}

function deserialize(value: string): unknown {
  return JSON.parse(value);
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002"
  );
}

export async function claimToolExecution(data: {
  runId: number;
  toolCallId: string;
  toolName: string;
  input: unknown;
  now?: Date;
}): Promise<ToolExecutionClaim> {
  const input = serialize(data.input);
  const now = data.now ?? new Date();
  let existing = await prisma.agentToolExecution.findUnique({
    where: {
      runId_toolCallId: {
        runId: data.runId,
        toolCallId: data.toolCallId,
      },
    },
  });

  if (!existing) {
    try {
      await prisma.agentToolExecution.create({
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
      if (!isUniqueConstraintError(error)) throw error;
      existing = await prisma.agentToolExecution.findUniqueOrThrow({
        where: {
          runId_toolCallId: {
            runId: data.runId,
            toolCallId: data.toolCallId,
          },
        },
      });
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

  if (
    existing.status === "running" &&
    now.getTime() - existing.startedAt.getTime() < STALE_TOOL_EXECUTION_AFTER_MS
  ) {
    throw new ToolExecutionConflictError(`Tool call ${data.toolCallId} is already running`);
  }

  await prisma.agentToolExecution.update({
    where: { id: existing.id },
    data: {
      status: "running",
      input,
      startedAt: now,
      endedAt: null,
      errorMessage: null,
      output: null,
    },
  });
  return { kind: "execute" };
}

export async function completeToolExecution(runId: number, toolCallId: string, output: unknown) {
  return prisma.agentToolExecution.update({
    where: { runId_toolCallId: { runId, toolCallId } },
    data: {
      status: "completed",
      output: serialize(output),
      errorMessage: null,
      endedAt: new Date(),
    },
  });
}

export async function failToolExecution(runId: number, toolCallId: string, error: unknown) {
  return prisma.agentToolExecution.update({
    where: { runId_toolCallId: { runId, toolCallId } },
    data: {
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
      endedAt: new Date(),
    },
  });
}
