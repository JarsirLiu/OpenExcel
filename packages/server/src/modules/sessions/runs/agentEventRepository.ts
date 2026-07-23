import type { AgentEvent } from "@openexcel/agent";
import { prisma } from "../../../infra/database/db.js";
import type { Prisma } from "../../../infra/database/prismaTypes.js";

export interface PersistedAgentStep {
  type: string;
  status: string;
  content: string | null;
  toolName: string | null;
  input: string | null;
  output: string | null;
  order: number;
}

export async function persistAgentEvent(
  runId: number,
  event: AgentEvent,
  step?: PersistedAgentStep,
) {
  return prisma.$transaction(async (tx) => {
    const persisted = await tx.agentEvent.create({
      data: {
        runId,
        eventId: event.eventId,
        sequence: event.sequence,
        type: event.type,
        occurredAt: new Date(event.occurredAt),
        payload: JSON.stringify(event.payload),
      },
    });

    if (step) {
      await tx.agentStep.create({
        data: {
          runId,
          ...step,
        },
      });
    }

    return persisted;
  });
}

export async function findAgentEventsByRun(runId: number) {
  return prisma.agentEvent.findMany({
    where: { runId },
    orderBy: { sequence: "asc" },
  });
}

export type AgentEventTransaction = Prisma.TransactionClient;
