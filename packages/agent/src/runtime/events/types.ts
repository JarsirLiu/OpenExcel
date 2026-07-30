export type AgentEventType =
  | "run.started"
  | "step.started"
  | "message.delta"
  | "reasoning.delta"
  | "tool.started"
  | "tool.finished"
  | "step.finished"
  | "context.automatic_compaction.started"
  | "context.automatic_compaction.completed"
  | "context.automatic_compaction.failed"
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

export class AgentPersistenceError extends Error {
  readonly cause: unknown;

  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = "AgentPersistenceError";
    this.cause = cause;
  }
}

export class AgentProtocolError extends Error {
  readonly code = "agent_protocol_error";
  readonly eventType?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options?: { eventType?: string; details?: Record<string, unknown> },
  ) {
    super(message);
    this.name = "AgentProtocolError";
    this.eventType = options?.eventType;
    this.details = options?.details;
  }
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
