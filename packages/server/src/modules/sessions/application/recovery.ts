import * as runRepo from "../runs/repository.js";
import { projectRunCheckpointForRun } from "../runs/sessionCheckpointProjector.js";
import { completeRunAndUpdateUndoCheckpoint } from "../runs/undoCheckpoint.js";

type RecoveryToolExecution = {
  toolCallId: string;
  toolName?: string;
  status: string;
  errorMessage?: string | null;
};

export type RunRecoveryDiagnosis = {
  canAutoRecover: boolean;
  reason:
    | "active_run"
    | "unfinished_tool"
    | "failed_tool"
    | "missing_output"
    | "session_changed"
    | "safe_to_complete";
  unresolvedToolCallIds: string[];
  failedToolCallIds: string[];
};

export function canAutoRecoverRun(
  run: { outputText: string | null },
  toolExecutions: readonly RecoveryToolExecution[],
) {
  return (
    toolExecutions.every((execution) => execution.status === "completed") && Boolean(run.outputText)
  );
}

export function diagnoseRunRecovery(
  run: { outputText: string | null },
  toolExecutions: readonly RecoveryToolExecution[],
  activeRun: boolean,
): RunRecoveryDiagnosis | null {
  if (activeRun) {
    return {
      canAutoRecover: false,
      reason: "active_run",
      unresolvedToolCallIds: [],
      failedToolCallIds: [],
    };
  }

  const unresolvedToolCallIds = toolExecutions
    .filter((execution) => execution.status === "running")
    .map((execution) => execution.toolCallId);
  if (unresolvedToolCallIds.length > 0) {
    return {
      canAutoRecover: false,
      reason: "unfinished_tool",
      unresolvedToolCallIds,
      failedToolCallIds: [],
    };
  }

  const failedToolCallIds = toolExecutions
    .filter((execution) => execution.status === "failed")
    .map((execution) => execution.toolCallId);
  if (failedToolCallIds.length > 0) {
    return {
      canAutoRecover: false,
      reason: "failed_tool",
      unresolvedToolCallIds: [],
      failedToolCallIds,
    };
  }

  if (!run.outputText) {
    return {
      canAutoRecover: false,
      reason: "missing_output",
      unresolvedToolCallIds: [],
      failedToolCallIds: [],
    };
  }

  return null;
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

  await projectRunCheckpointForRun(workspaceId, sessionId, runId);

  const toolExecutions = await runRepo.findRunToolExecutions(runId);
  const activeRun = await runRepo.findActiveRun(sessionId);
  const canAutoRecover = activeRun == null && canAutoRecoverRun(run, toolExecutions);
  if (!canAutoRecover) {
    const diagnosis = diagnoseRunRecovery(run, toolExecutions, activeRun != null) ?? {
      canAutoRecover: false,
      reason: "session_changed" as const,
      unresolvedToolCallIds: [],
      failedToolCallIds: [],
    };
    return {
      runId: run.id,
      status: run.status,
      canAutoRecover,
      toolExecutions,
      diagnosis,
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
