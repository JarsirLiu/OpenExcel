import type { AgentRunCompletion, AgentTranscriptMessage } from "@openexcel/agent";
import { formatAIError } from "@openexcel/agent";
import {
  findAgentEventsByRun,
  findAgentEventsForCheckpoint,
  persistRunLifecycleEvent,
} from "./agentEventRepository.js";
import { advanceTranscriptSequence, persistRunCheckpoint } from "./checkpointRepository.js";
import * as runRepo from "./repository.js";
import {
  projectRunCheckpoint,
  projectStreamedAssistantMessages,
} from "./runCheckpointProjector.js";
import type { AcquiredRunLease } from "./runLease.js";
import { completeRunAndUpdateUndoCheckpoint } from "./undoCheckpoint.js";

type FinalizerStatus = "completed" | "cancelled" | "failed" | "recovery_required";

export interface RunFinalizationInput {
  completion?: AgentRunCompletion;
  messages?: AgentTranscriptMessage[];
  status?: FinalizerStatus;
  outputText?: string | null;
  errorMessage?: string;
  leaseLost?: boolean;
}

function outcomeFromInput(input: RunFinalizationInput) {
  if (input.leaseLost) {
    return {
      status: "recovery_required" as const,
      errorMessage: input.errorMessage ?? "运行租约丢失，等待恢复器检查",
    };
  }

  if (input.completion?.failureKind === "persistence") {
    return {
      status: "recovery_required" as const,
      errorMessage: "运行事件持久化失败，需要恢复后再继续",
    };
  }

  if (input.completion) {
    return {
      status: input.completion.status as FinalizerStatus,
      outputText: input.completion.status === "completed" ? input.completion.text || null : null,
      errorMessage:
        input.completion.status === "failed" ? formatAIError(input.completion.error) : undefined,
    };
  }

  return {
    status: input.status ?? "failed",
    outputText: input.outputText,
    errorMessage: input.errorMessage,
  };
}

export function createRunFinalizer(options: {
  workspaceId: number;
  sessionId: number;
  lease: AcquiredRunLease;
}) {
  let finalization: Promise<void> | undefined;

  async function finalize(input: RunFinalizationInput) {
    const outcome = outcomeFromInput(input);
    let messages = input.messages ?? input.completion?.messages;
    let allEvents: Awaited<ReturnType<typeof findAgentEventsByRun>> = [];
    try {
      allEvents = await findAgentEventsByRun(options.lease.run.id);
      if (outcome.status !== "recovery_required") {
        await persistRunLifecycleEvent({
          runId: options.lease.run.id,
          type:
            outcome.status === "completed"
              ? "run.completed"
              : outcome.status === "cancelled"
                ? "run.cancelled"
                : "run.failed",
          payload: {
            error: outcome.errorMessage,
            isAborted: outcome.status === "cancelled",
          },
        });
        allEvents = await findAgentEventsByRun(options.lease.run.id);
      }
      const streamedMessages = projectStreamedAssistantMessages(
        await findAgentEventsForCheckpoint(options.lease.run.id),
      );
      if (streamedMessages.length > 0) {
        // Events are the durable source for streamed text/reasoning in every
        // terminal state. completion.messages is a transport result and may
        // omit reasoning even when its deltas were persisted.
        messages = mergeStreamedAssistantMessages(
          (messages ?? options.lease.transcript ?? []) as AgentTranscriptMessage[],
          (options.lease.transcript ?? []) as AgentTranscriptMessage[],
          streamedMessages,
        );
      }
      if (allEvents.length > 0 && messages) {
        const checkpoint = projectRunCheckpoint(allEvents.map(toAgentEvent), messages);
        await persistRunCheckpoint({ runId: options.lease.run.id, ...checkpoint });
      }
      if (messages && allEvents.length > 0) {
        await advanceTranscriptSequence(options.lease.run.id, allEvents.at(-1)?.sequence ?? 0);
      }
    } catch (error) {
      outcome.status = "recovery_required";
      outcome.errorMessage = `会话消息持久化失败，需要恢复后再继续: ${formatAIError(error)}`;
    }

    try {
      const updated = await completeRunAndUpdateUndoCheckpoint(
        options.workspaceId,
        options.sessionId,
        options.lease.run.id,
        {
          status: outcome.status,
          outputText: outcome.outputText,
          errorMessage: outcome.errorMessage,
        },
        {
          ownerId: options.lease.ownerId,
          sessionVersion: options.lease.sessionVersion,
        },
      );
      if (updated === false) {
        await markRecoveryRequired("运行租约已失效，等待恢复器检查");
      }
    } catch (error) {
      console.error(`[session] Failed to finalize run ${options.lease.run.id}:`, error);
      await markRecoveryRequired(`运行终态写入失败，需要恢复: ${formatAIError(error)}`);
    } finally {
      try {
        await options.lease.release();
      } catch (error) {
        console.error(`[session] Failed to release lease for run ${options.lease.run.id}:`, error);
      }
    }
  }

  async function markRecoveryRequired(errorMessage: string) {
    try {
      const marked = await runRepo.updateRunWithLease(
        options.lease.run.id,
        {
          status: "recovery_required",
          errorMessage,
          endedAt: new Date(),
        },
        {
          ownerId: options.lease.ownerId,
          sessionVersion: options.lease.sessionVersion,
        },
      );
      if (!marked) {
        console.error(`[session] Failed to mark run ${options.lease.run.id} for recovery`);
      }
    } catch (recoveryError) {
      console.error(
        `[session] Failed to persist recovery state for run ${options.lease.run.id}:`,
        recoveryError,
      );
    }
  }

  return {
    finalize(input: RunFinalizationInput) {
      finalization ??= finalize(input);
      return finalization;
    },
  };
}

function mergeStreamedAssistantMessages(
  messages: AgentTranscriptMessage[],
  transcript: AgentTranscriptMessage[],
  streamed: AgentTranscriptMessage[],
): AgentTranscriptMessage[] {
  const prefix = messages.slice(0, transcript.length);
  const generated = messages.slice(transcript.length);
  const generatedAssistants = generated.filter((message) => message.role === "assistant");
  const merged = streamed.map((streamedMessage, index) => {
    const existing = generatedAssistants[index];
    if (!existing || existing.role !== "assistant") return streamedMessage;
    const nonStreamParts = (Array.isArray(existing.parts) ? existing.parts : []).filter(
      (part: any) => part.type !== "text" && part.type !== "reasoning",
    );
    return {
      ...existing,
      parts: [
        ...nonStreamParts,
        ...(Array.isArray(streamedMessage.parts) ? streamedMessage.parts : []),
      ],
    };
  });
  return [...prefix, ...generated.filter((message) => message.role !== "assistant"), ...merged];
}

function toAgentEvent(event: {
  eventId: string;
  sequence: number;
  type: string;
  occurredAt: Date;
  payload: string;
}) {
  let payload: unknown = null;
  try {
    payload = JSON.parse(event.payload);
  } catch {
    // Invalid payloads remain in the event log but are excluded from projection.
  }
  return {
    eventId: event.eventId,
    sequence: event.sequence,
    type: event.type as import("@openexcel/agent").AgentEvent["type"],
    occurredAt: event.occurredAt.toISOString(),
    payload,
  };
}
