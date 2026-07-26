import type { AgentEventSink, AgentRunCompletion, AgentTranscriptMessage } from "@openexcel/agent";
import { formatAIError } from "@openexcel/agent";
import { findAgentEventsByRun, persistRunLifecycleEvent } from "./agentEventRepository.js";
import { persistRunCheckpoint } from "./checkpointRepository.js";
import * as runRepo from "./repository.js";
import { projectRunCheckpoint, projectRunTranscript } from "./runCheckpointProjector.js";
import type { AcquiredRunLease } from "./runLease.js";
import { completeRunAndUpdateUndoCheckpoint } from "./undoCheckpoint.js";

type FinalizerStatus = "completed" | "cancelled" | "failed" | "recovery_required";

export interface RunFinalizationInput {
  completion?: AgentRunCompletion;
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
      failurePhase: undefined,
      failureStepIndex: undefined,
    };
  }

  if (input.completion?.failureKind === "persistence") {
    return {
      status: "recovery_required" as const,
      errorMessage: "运行事件持久化失败，需要恢复后再继续",
      failurePhase: "persistence" as const,
      failureStepIndex: undefined,
    };
  }

  if (input.completion) {
    return {
      status: input.completion.status as FinalizerStatus,
      outputText: input.completion.status === "completed" ? input.completion.text || null : null,
      errorMessage:
        input.completion.status === "failed" ? formatAIError(input.completion.error) : undefined,
      failurePhase: input.completion.failurePhase,
      failureStepIndex: input.completion.failureStepIndex,
    };
  }

  return {
    status: input.status ?? "failed",
    outputText: input.outputText,
    errorMessage: input.errorMessage,
    failurePhase: undefined,
    failureStepIndex: undefined,
  };
}

export function createRunFinalizer(options: {
  workspaceId: number;
  sessionId: number;
  lease: AcquiredRunLease;
  eventSink?: AgentEventSink;
}) {
  let finalization: Promise<void> | undefined;

  async function finalize(input: RunFinalizationInput) {
    const outcome = outcomeFromInput(input);
    let allEvents: Awaited<ReturnType<typeof findAgentEventsByRun>> = [];
    let lifecycleEvent: Awaited<ReturnType<typeof persistRunLifecycleEvent>> | undefined;
    try {
      allEvents = await findAgentEventsByRun(options.lease.run.id);
      if (allEvents.length > 0) {
        const durableEvents = allEvents.map(toAgentEvent);
        const transcript = projectRunTranscript(
          durableEvents,
          (options.lease.transcript ?? []) as AgentTranscriptMessage[],
        );
        const checkpoint = projectRunCheckpoint(durableEvents, transcript);
        await persistRunCheckpoint({ runId: options.lease.run.id, ...checkpoint });
      }
      if (outcome.status !== "recovery_required") {
        lifecycleEvent = await persistRunLifecycleEvent({
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
            ...(outcome.failurePhase ? { failurePhase: outcome.failurePhase } : {}),
            ...(outcome.failureStepIndex == null
              ? {}
              : { failureStepIndex: outcome.failureStepIndex }),
          },
        });
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
      } else if (lifecycleEvent) {
        await options.eventSink?.publish(toAgentEvent(lifecycleEvent));
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
