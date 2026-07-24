import type {
  AgentEventEmitter,
  AgentEventSink,
  AgentEventType,
  PersistenceBarrier,
} from "./types.js";
import { createAgentEvent } from "./types.js";

export function createAgentEventEmitter(options: {
  eventSink?: AgentEventSink;
  persistenceBarrier?: PersistenceBarrier;
}): AgentEventEmitter {
  let sequence = 0;

  return {
    async emit(type, payload) {
      const event = createAgentEvent(type, payload, sequence++);

      await options.persistenceBarrier?.persist(event);
      await options.eventSink?.publish(event);
      return event;
    },
  };
}
