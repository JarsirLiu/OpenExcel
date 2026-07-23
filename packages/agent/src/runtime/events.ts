import type {
  AgentEvent,
  AgentEventSink,
  AgentEventType,
  PersistenceBarrier,
} from "./contracts.js";

export interface AgentEventEmitter {
  emit(type: AgentEventType, payload?: unknown): Promise<AgentEvent>;
}

export function createAgentEventEmitter(options: {
  eventSink?: AgentEventSink;
  persistenceBarrier?: PersistenceBarrier;
}): AgentEventEmitter {
  let sequence = 0;

  return {
    async emit(type, payload) {
      const event: AgentEvent = {
        eventId: `agent-event-${crypto.randomUUID()}`,
        sequence: sequence++,
        type,
        occurredAt: new Date().toISOString(),
        payload,
      };

      // Durability is deliberately before broadcast. A subscriber must never
      // observe an event that cannot be replayed from the server.
      await options.persistenceBarrier?.persist(event);
      await options.eventSink?.publish(event);
      return event;
    },
  };
}
