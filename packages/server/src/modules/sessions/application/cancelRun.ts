import { notifyRunCancellation } from "../runs/cancellation.js";
import * as runRepo from "../runs/repository.js";

export async function cancelRun(workspaceId: number, sessionId: number, runId: number) {
  const run = await runRepo.findRunForSession(workspaceId, sessionId, runId);
  if (!run) return null;

  if (run.status === "running") {
    await runRepo.requestRunCancellation(runId);
    notifyRunCancellation(runId);
  }

  const current = await runRepo.findRunForSession(workspaceId, sessionId, runId);
  if (!current) return null;
  return {
    runId: current.id,
    status: current.status,
    cancelRequested: current.cancelRequestedAt != null,
  };
}
