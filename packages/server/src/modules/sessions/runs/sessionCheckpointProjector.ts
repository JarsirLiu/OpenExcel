import type { AgentTranscriptMessage } from "@openexcel/agent";
import { findAgentEventsForProjection } from "./agentEventRepository.js";
import {
  findLatestSessionCheckpoint,
  findRunCheckpoint,
  findRunProjectionState,
  persistRunCheckpoint,
  type RunCheckpoint,
} from "./checkpointRepository.js";
import { projectRunCheckpoint, projectRunTranscriptEntries } from "./runCheckpointProjector.js";

/**
 * Closes the durable projection gap before a session history read.
 * The event journal remains authoritative; this function only advances the
 * checkpoint read model and its monotonic boundary.
 */
export async function projectRunCheckpointForRun(
  workspaceId: number,
  sessionId: number,
  runId: number,
): Promise<RunCheckpoint | null> {
  const run = await findRunProjectionState(workspaceId, sessionId, runId);
  if (!run) return null;

  const currentRunCheckpoint = await findRunCheckpoint(run.id);
  const baseCheckpoint =
    currentRunCheckpoint ?? (await findLatestSessionCheckpoint(workspaceId, sessionId));
  const checkpointSequence = currentRunCheckpoint?.checkpointSequence ?? -1;
  if (run.lastEventSequence <= checkpointSequence) {
    return baseCheckpoint;
  }

  const persistedEvents = await findAgentEventsForProjection(run.id, checkpointSequence);
  if (persistedEvents.length === 0) return baseCheckpoint;

  const events = persistedEvents;
  const baseTranscript = (currentRunCheckpoint?.transcript ??
    baseCheckpoint?.transcript ??
    []) as import("@openexcel/agent").ContextTranscriptEntry<AgentTranscriptMessage>[];
  const transcript = projectRunTranscriptEntries(events, baseTranscript);
  const checkpoint = projectRunCheckpoint(events, transcript, currentRunCheckpoint ?? undefined);

  await persistRunCheckpoint({ runId: run.id, ...checkpoint });

  return findRunCheckpoint(run.id);
}
