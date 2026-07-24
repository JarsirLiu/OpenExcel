import * as runRepo from "../runs/repository.js";
import { completeRunAndUpdateUndoCheckpoint } from "../runs/undoCheckpoint.js";

function transcriptContainsOutput(chatMessages: string | null, outputText: string | null) {
  if (!chatMessages || !outputText) return false;

  try {
    const messages: unknown = JSON.parse(chatMessages);
    return (
      Array.isArray(messages) &&
      messages.some(
        (message) =>
          message &&
          typeof message === "object" &&
          (message as Record<string, unknown>).role === "assistant" &&
          Array.isArray((message as Record<string, unknown>).parts) &&
          ((message as Record<string, unknown>).parts as unknown[]).some(
            (part) =>
              part &&
              typeof part === "object" &&
              (part as Record<string, unknown>).type === "text" &&
              (part as Record<string, unknown>).text === outputText,
          ),
      )
    );
  } catch {
    return false;
  }
}

export function canAutoRecoverRun(
  run: { outputText: string | null; session: { chatMessages: string | null } },
  toolExecutions: readonly { status: string }[],
) {
  return (
    toolExecutions.every((execution) => execution.status === "completed") &&
    transcriptContainsOutput(run.session.chatMessages, run.outputText)
  );
}

export async function recoverRun(workspaceId: number, sessionId: number, runId: number) {
  const run = await runRepo.findRunRecoveryState(workspaceId, sessionId, runId);
  if (!run) return null;
  if (run.status === "completed") {
    return { runId: run.id, status: run.status, canAutoRecover: true };
  }
  if (run.status !== "recovery_required") {
    return { runId: run.id, status: run.status, canAutoRecover: false };
  }

  const toolExecutions = await runRepo.findRunToolExecutions(runId);
  const activeRun = await runRepo.findActiveRun(sessionId);
  const canAutoRecover = activeRun == null && canAutoRecoverRun(run, toolExecutions);
  if (!canAutoRecover) {
    return {
      runId: run.id,
      status: run.status,
      canAutoRecover,
      toolExecutions,
    };
  }

  const recoveredByThisRequest = await completeRunAndUpdateUndoCheckpoint(
    workspaceId,
    sessionId,
    runId,
    {
      status: "completed",
      errorMessage: null,
      endedAt: run.endedAt ?? new Date(),
    },
    undefined,
    { sessionVersion: run.session.version },
  );
  if (recoveredByThisRequest === false) {
    return {
      runId: run.id,
      status: "recovery_required" as const,
      canAutoRecover: false,
      recoveryConflict: true,
    };
  }
  const recovered = await runRepo.findRunForSession(workspaceId, sessionId, runId);
  return {
    runId: recovered?.id ?? run.id,
    status: recovered?.status ?? "completed",
    canAutoRecover: true,
  };
}

export async function abandonRun(workspaceId: number, sessionId: number, runId: number) {
  const run = await runRepo.findRunForSession(workspaceId, sessionId, runId);
  if (!run) return null;
  if (run.status !== "recovery_required") {
    return { runId: run.id, status: run.status };
  }

  const abandoned = await runRepo.transitionRunStatus(runId, "abandoned", {
    errorMessage: run.errorMessage ?? "运行已放弃恢复",
    endedAt: run.endedAt ?? new Date(),
  });
  return { runId: abandoned?.id ?? run.id, status: abandoned?.status ?? "abandoned" };
}
