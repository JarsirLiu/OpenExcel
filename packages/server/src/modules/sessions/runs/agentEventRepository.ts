import type { AgentEvent } from "@openexcel/agent";
import { withDatabaseWriteLock } from "../../../infra/database/databaseConcurrency.js";
import { prisma } from "../../../infra/database/db.js";

export class AgentEventConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentEventConflictError";
  }
}

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
  const data = eventPersistenceData(runId, event);

  try {
    return await withDatabaseWriteLock(() =>
      prisma.$transaction(async (tx) => {
        const existing = await findExistingEvent(tx, runId, event);
        if (existing) return existing;

        const persisted = await tx.agentEvent.create({ data });

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
      }),
    );
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    // A concurrent writer may have won either unique constraint. The failed
    // transaction is over before this lookup so the client remains usable.
    const existing = await findExistingEvent(prisma, runId, event);
    if (existing) return existing;
    throw error;
  }
}

function eventPersistenceData(runId: number, event: AgentEvent) {
  return {
    runId,
    eventId: event.eventId,
    sequence: event.sequence,
    type: event.type,
    occurredAt: new Date(event.occurredAt),
    payload: JSON.stringify(event.payload),
  };
}

type AgentEventDatabase = Pick<typeof prisma, "agentEvent">;

async function findExistingEvent(db: AgentEventDatabase, runId: number, event: AgentEvent) {
  const byEventId = await db.agentEvent.findUnique({ where: { eventId: event.eventId } });
  const bySequence = await db.agentEvent.findUnique({
    where: { runId_sequence: { runId, sequence: event.sequence } },
  });
  const existing = byEventId ?? bySequence;
  if (!existing) return null;

  const expected = eventPersistenceData(runId, event);
  if (
    existing.runId !== expected.runId ||
    existing.eventId !== expected.eventId ||
    existing.sequence !== expected.sequence ||
    existing.type !== expected.type ||
    existing.occurredAt.getTime() !== expected.occurredAt.getTime() ||
    existing.payload !== expected.payload
  ) {
    throw new AgentEventConflictError(
      `Agent event conflict for run ${runId}, sequence ${event.sequence}`,
    );
  }
  return existing;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002"
  );
}

export async function persistRunLifecycleEvent(data: {
  runId: number;
  type: Extract<AgentEvent["type"], "run.completed" | "run.cancelled" | "run.failed">;
  payload: unknown;
}) {
  return withDatabaseWriteLock(() =>
    prisma.$transaction(async (tx) => {
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
    }),
  );
}

export async function findAgentEventsByRun(runId: number) {
  return prisma.agentEvent.findMany({
    where: { runId },
    orderBy: { sequence: "asc" },
  });
}

export async function findAgentEventsForProjection(runId: number, afterSequence = -1) {
  const events = await prisma.agentEvent.findMany({
    where: { runId, sequence: { gt: afterSequence } },
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
