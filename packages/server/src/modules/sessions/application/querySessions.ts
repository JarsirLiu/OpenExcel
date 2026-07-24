import * as repo from "../infrastructure/sessionRepository.js";
import * as runRepo from "../runs/repository.js";
import { canAutoRecoverRun } from "./recovery.js";
import { getSessionMessagesPaginated, historyFromRuns } from "./transcript.js";

export async function getSessions(workspaceId: number) {
  return repo.findSessionsByWorkspace(workspaceId);
}

export async function deleteSession(workspaceId: number, sessionId: number) {
  return repo.deleteSession(sessionId, workspaceId);
}

export async function renameSession(workspaceId: number, sessionId: number, name: string) {
  return repo.updateSession(sessionId, { name, titleStatus: "manual" }, workspaceId);
}

export async function getSession(workspaceId: number, sessionId: number) {
  return repo.findSession(sessionId, workspaceId);
}

export async function getMessages(
  workspaceId: number,
  sessionId: number,
  limit = 40,
  offset = 0,
): Promise<{ messages: any[]; total: number }> {
  const session = await repo.findSession(sessionId, workspaceId);
  if (!session) return { messages: [], total: 0 };

  const { messages, total } = await getSessionMessagesPaginated(
    workspaceId,
    sessionId,
    limit,
    offset,
  );
  if (messages.length > 0) return { messages, total };

  const runs = await runRepo.findRunsBySession(workspaceId, sessionId);
  const transcript = historyFromRuns(runs);
  const t = transcript.length;
  const start = Math.max(0, t - offset - limit);
  const end = t - offset;
  return { messages: transcript.slice(start, end), total: t };
}

export async function getRuns(
  workspaceId: number,
  sessionId: number,
  status?: "recovery_required",
) {
  const session = await repo.findSession(sessionId, workspaceId);
  if (!session) return [];
  const runs = await runRepo.findRunsBySession(workspaceId, sessionId, status);
  const steps = await Promise.all(
    runs.map(async (run: (typeof runs)[number]) => ({
      ...run,
      steps: await runRepo.findStepsByRun(run.id),
    })),
  );
  return steps;
}

export async function getRecoveryRuns(workspaceId: number, sessionId: number) {
  const runs = await runRepo.findRunsBySession(workspaceId, sessionId, "recovery_required");
  const activeRun = await runRepo.findActiveRun(sessionId);
  return Promise.all(
    runs.map(async (run) => {
      const toolExecutions = await runRepo.findRunToolExecutions(run.id);
      const recoveryState = await runRepo.findRunRecoveryState(workspaceId, sessionId, run.id);
      const affected = await runRepo.findRunAffectedEntities(run.id);
      return {
        id: run.id,
        status: run.status,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        errorMessage: run.errorMessage,
        lastEventSequence: run.lastEventSequence,
        affectedWorkbooks: affected.workbookIds,
        affectedSheets: affected.sheetIds,
        toolExecutions,
        canAutoRecover:
          activeRun == null &&
          recoveryState != null &&
          canAutoRecoverRun(recoveryState, toolExecutions),
      };
    }),
  );
}
