import type { AgentEvent } from "@openexcel/agent";
import { prisma } from "../../../infra/database/db.js";

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

    await tx.agentRun.updateMany({
      where: { id: runId, lastEventSequence: { lt: event.sequence } },
      data: { lastEventSequence: event.sequence },
    });

    return persisted;
  });
}

export async function findAgentEventsByRun(runId: number) {
  return prisma.agentEvent.findMany({
    where: { runId },
    orderBy: { sequence: "asc" },
  });
}

export async function findAgentEventPageForSession(data: {
  workspaceId: number;
  sessionId: number;
  runId: number;
  afterSequence: number;
  limit: number;
}) {
  return prisma.$transaction(async (tx) => {
    const run = await tx.agentRun.findFirst({
      where: {
        id: data.runId,
        sessionId: data.sessionId,
        session: { workspaceId: data.workspaceId },
      },
      select: {
        id: true,
        status: true,
        clientRequestId: true,
        startedAt: true,
        lastEventSequence: true,
        endedAt: true,
        outputText: true,
        errorMessage: true,
        cancelRequestedAt: true,
      },
    });
    if (!run) return null;

    const events = await tx.agentEvent.findMany({
      where: { runId: data.runId, sequence: { gt: data.afterSequence } },
      orderBy: { sequence: "asc" },
      take: data.limit,
    });

    return { run, events };
  });
}
