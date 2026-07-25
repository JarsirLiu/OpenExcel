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

export async function persistRunLifecycleEvent(data: {
  runId: number;
  type: Extract<AgentEvent["type"], "run.completed" | "run.cancelled" | "run.failed">;
  payload: unknown;
}) {
  return prisma.$transaction(async (tx) => {
    const latest = await tx.agentEvent.findFirst({
      where: { runId: data.runId },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    });
    const sequence = (latest?.sequence ?? -1) + 1;
    const event = await tx.agentEvent.create({
      data: {
        runId: data.runId,
        eventId: `agent-event-${crypto.randomUUID()}`,
        sequence,
        type: data.type,
        occurredAt: new Date(),
        payload: JSON.stringify(data.payload),
      },
    });
    await tx.agentRun.updateMany({
      where: { id: data.runId, lastEventSequence: { lt: sequence } },
      data: { lastEventSequence: sequence },
    });
    return event;
  });
}

export async function findAgentEventsByRun(runId: number) {
  return prisma.agentEvent.findMany({
    where: { runId },
    orderBy: { sequence: "asc" },
  });
}

export async function findAgentEventsForCheckpoint(runId: number) {
  const events = await prisma.agentEvent.findMany({
    where: { runId, type: { in: ["message.delta", "reasoning.delta"] } },
    orderBy: { sequence: "asc" },
  });
  return events.map((event) => ({
    eventId: event.eventId,
    sequence: event.sequence,
    type: event.type as AgentEvent["type"],
    occurredAt: event.occurredAt.toISOString(),
    payload: parseEventPayload(event.payload),
  }));
}

function parseEventPayload(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
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
        transcriptSequence: true,
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
