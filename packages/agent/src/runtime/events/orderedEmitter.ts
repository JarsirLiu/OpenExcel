import type { AgentEvent, AgentEventSink, AgentEventType, PersistenceBarrier } from "./types.js";
import { AgentPersistenceError, createAgentEvent } from "./types.js";

export interface OrderedAgentEventEmitter {
  emit(type: AgentEventType, payload?: unknown): Promise<AgentEvent>;
  flushAndClose(): Promise<void>;
}

export function createOrderedAgentEventEmitter(options: {
  eventSink?: AgentEventSink;
  persistenceBarrier?: PersistenceBarrier;
  abortController?: AbortController;
}): OrderedAgentEventEmitter {
  let sequence = 0;
  let tail = Promise.resolve();
  let closed = false;
  let failure: AgentPersistenceError | undefined;

  function assertOpen() {
    if (failure) throw failure;
    if (closed) throw new Error("Agent event emitter is closed");
  }

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(async () => {
      assertOpen();
      try {
        return await operation();
      } catch (error) {
        failure = error instanceof AgentPersistenceError ? error : new AgentPersistenceError(error);
        options.abortController?.abort(failure);
        throw failure;
      }
    });
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  return {
    emit(type, payload) {
      if (failure) return Promise.reject(failure);
      if (closed) return Promise.reject(new Error("Agent event emitter is closed"));
      const event = createAgentEvent(type, payload, sequence++);
      return enqueue(async () => {
        await options.persistenceBarrier?.persist(event);
        await options.eventSink?.publish(event);
        return event;
      });
    },
    async flushAndClose() {
      closed = true;
      await tail;
      if (failure) throw failure;
    },
  };
}
