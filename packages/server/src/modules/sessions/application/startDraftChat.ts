import { streamChat } from "../chat/index.js";
import { DraftRequestConflictError } from "../domain/sessionErrors.js";
import * as repo from "../infrastructure/sessionRepository.js";
import * as runRepo from "../runs/repository.js";
import type { ChatTurnRequest } from "./chatTurn.js";
import { toCanonicalUserMessage } from "./chatTurn.js";
import { extractMessageText } from "./messageText.js";
import { fallbackTitleFromPrompt } from "./title.js";

export async function startDraftChat(
  workspaceId: number,
  turn: ChatTurnRequest,
  options: { abortSignal?: AbortSignal } = {},
) {
  const { abortSignal } = options;
  if (abortSignal?.aborted) {
    throw new Error("Chat request aborted");
  }

  if (turn.requestId) {
    const existingRun = await runRepo.findRunByClientRequestId(workspaceId, turn.requestId);
    if (existingRun) {
      throw new DraftRequestConflictError(existingRun.sessionId);
    }
  }

  const message = toCanonicalUserMessage(turn);
  const firstUserText = extractMessageText(message);
  const session = await repo.createSession(
    workspaceId,
    fallbackTitleFromPrompt(firstUserText),
    "[]",
  );

  try {
    const stream = await streamChat(workspaceId, session.id, turn, abortSignal);
    return { session, stream };
  } catch (error) {
    await repo.deleteSession(session.id, workspaceId);
    if (turn.requestId) {
      const existingRun = await runRepo.findRunByClientRequestId(workspaceId, turn.requestId);
      if (existingRun) {
        throw new DraftRequestConflictError(existingRun.sessionId);
      }
    }
    throw error;
  }
}
