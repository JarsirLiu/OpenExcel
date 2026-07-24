import type { AgentEventEmitter, AgentEventSink, PersistenceBarrier } from "./types.js";
import { AgentPersistenceError, createAgentEvent } from "./types.js";

export function createAgentEventEmitter(options: {
  eventSink?: AgentEventSink;
  persistenceBarrier?: PersistenceBarrier;
}): AgentEventEmitter {
  let sequence = 0;

  return {
    async emit(type, payload) {
      const event = createAgentEvent(type, payload, sequence++);

      try {
        await options.persistenceBarrier?.persist(event);
      } catch (error) {
        throw error instanceof AgentPersistenceError ? error : new AgentPersistenceError(error);
      }
      await options.eventSink?.publish(event);
      return event;
    },
  };
}
