import { streamChat } from "../chat/index.js";
import { DraftRequestConflictError } from "../domain/sessionErrors.js";
import * as repo from "../infrastructure/sessionRepository.js";
import * as runRepo from "../runs/repository.js";
import { extractFirstUserText } from "./messageText.js";
import { fallbackTitleFromPrompt } from "./title.js";

export async function startDraftChat(
  workspaceId: number,
  messages: any[],
  options: { abortSignal?: AbortSignal; clientRequestId?: string } = {},
) {
  const { abortSignal, clientRequestId } = options;
  if (abortSignal?.aborted) {
    throw new Error("Chat request aborted");
  }

  if (clientRequestId) {
    const existingRun = await runRepo.findRunByClientRequestId(workspaceId, clientRequestId);
    if (existingRun) {
      throw new DraftRequestConflictError(existingRun.sessionId);
    }
  }

  const firstUserText = extractFirstUserText(messages);
  const session = await repo.createSession(
    workspaceId,
    fallbackTitleFromPrompt(firstUserText),
    JSON.stringify(messages),
  );

  try {
    const stream = await streamChat(workspaceId, session.id, messages, abortSignal, {
      clientRequestId,
    });
    return { session, stream };
  } catch (error) {
    await repo.deleteSession(session.id, workspaceId);
    if (clientRequestId) {
      const existingRun = await runRepo.findRunByClientRequestId(workspaceId, clientRequestId);
      if (existingRun) {
        throw new DraftRequestConflictError(existingRun.sessionId);
      }
    }
    throw error;
  }
}
