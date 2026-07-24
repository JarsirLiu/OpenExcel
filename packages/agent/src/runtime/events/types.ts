export type AgentEventType =
  | "run.started"
  | "tool.started"
  | "tool.finished"
  | "step.finished"
  | "run.completed"
  | "run.cancelled"
  | "run.failed";

export interface AgentEvent {
  eventId: string;
  sequence: number;
  type: AgentEventType;
  occurredAt: string;
  payload: unknown;
}

export interface AgentEventSink {
  publish(event: AgentEvent): void | Promise<void>;
}

export interface PersistenceBarrier {
  persist(event: AgentEvent): void | Promise<void>;
}

export interface AgentEventEmitter {
  emit(type: AgentEventType, payload?: unknown): Promise<AgentEvent>;
}

export function createAgentEvent(
  type: AgentEventType,
  payload: unknown,
  sequence: number,
): AgentEvent {
  return {
    eventId: `agent-event-${crypto.randomUUID()}`,
    sequence,
    type,
    occurredAt: new Date().toISOString(),
    payload,
  };
}
