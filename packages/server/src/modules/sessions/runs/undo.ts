import * as repo from "./repository.js";

export async function undoLatestRun(workspaceId: number, sessionId: number) {
  const run = await repo.findLatestUndoableRun(workspaceId, sessionId);
  if (!run) {
    throw new Error("没有可撤销的本轮修改");
  }

  const restoredSheetIds = await repo.restoreRunSheetSnapshots(run.id);
  return {
    runId: run.id,
    restoredSheetIds,
  };
}
