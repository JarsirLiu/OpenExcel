import * as sessionRepo from "../infrastructure/sessionRepository.js";

export async function getUndoAvailability(workspaceId: number, sessionId: number) {
  const checkpoint = await sessionRepo.findSessionUndoCheckpoint(sessionId, workspaceId);
  return { canUndo: checkpoint?.undoRunId != null };
}
