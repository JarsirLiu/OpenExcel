import * as eventRepo from "../runs/agentEventRepository.js";
import { orderAndDeduplicateEvents } from "../runs/eventReplay.js";
import * as runRepo from "../runs/repository.js";
import { isRunStatus, terminalRunStatuses } from "../runs/status.js";

function decodeEventPayload(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    throw new Error("运行事件数据损坏，无法回放");
  }
}

function toRunSnapshot(run: {
  id: number;
  status: string;
  clientRequestId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  outputText: string | null;
  errorMessage: string | null;
  cancelRequestedAt: Date | null;
  lastEventSequence: number;
}) {
  return {
    runId: run.id,
    status: run.status,
    requestId: run.clientRequestId,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    outputText: run.outputText,
    errorMessage: run.errorMessage,
    cancelRequested: run.cancelRequestedAt != null,
    terminal: isRunStatus(run.status) && terminalRunStatuses.has(run.status),
    lastEventSequence: run.lastEventSequence,
  };
}

export async function getRunReplaySnapshot(workspaceId: number, sessionId: number, runId: number) {
  const run = await runRepo.findRunReplaySnapshot(workspaceId, sessionId, runId);
  return run ? toRunSnapshot(run) : null;
}

export async function getRunEventPage(data: {
  workspaceId: number;
  sessionId: number;
  runId: number;
  afterSequence: number;
  limit: number;
}) {
  const page = await eventRepo.findAgentEventPageForSession(data);
  if (!page) return null;

  const events = orderAndDeduplicateEvents(
    page.events.map((event) => ({
      eventId: event.eventId,
      sequence: event.sequence,
      type: event.type,
      occurredAt: event.occurredAt,
      payload: decodeEventPayload(event.payload),
    })),
    data.afterSequence,
  );
  const lastReturnedSequence = events.at(-1)?.sequence ?? data.afterSequence;

  return {
    run: toRunSnapshot(page.run),
    events,
    cursor: {
      after: lastReturnedSequence,
      lastEventSequence: page.run.lastEventSequence,
    },
    hasMore: lastReturnedSequence < page.run.lastEventSequence,
  };
}
