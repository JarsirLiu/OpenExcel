import type { AgentRunCompletion, AgentTranscriptMessage } from "@openexcel/agent";
import { formatAIError } from "@openexcel/agent";
import { withSessionLock } from "../infrastructure/sessionLock.js";
import * as sessionRepo from "../infrastructure/sessionRepository.js";
import * as runRepo from "./repository.js";
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
    const messages = input.messages ?? input.completion?.messages;

    try {
      if (messages) {
        const persisted = await withSessionLock(options.sessionId, () =>
          sessionRepo.updateSessionMessagesWithLease({
            workspaceId: options.workspaceId,
            sessionId: options.sessionId,
            ownerId: options.lease.ownerId,
            sessionVersion: options.lease.sessionVersion,
            chatMessages: JSON.stringify(messages),
          }),
        );
        if (!persisted) {
          outcome.status = "recovery_required";
          outcome.errorMessage = "运行租约已失效，未覆盖后续会话消息";
        }
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
