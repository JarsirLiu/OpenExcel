import type { z } from "zod";
import type { ModelConfig } from "../model.js";
import type { WorkspaceWorkbookSummary } from "../session/context.js";

export type AgentTranscriptMessage = Record<string, unknown>;

export interface AgentToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
}

export interface AgentToolExecutionOptions {
  toolCallId: string;
  abortSignal?: AbortSignal;
  context: unknown;
}

export interface ToolExecutor {
  execute(toolName: string, input: unknown, options: AgentToolExecutionOptions): Promise<unknown>;
}

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

export type AgentTimeoutConfiguration =
  | number
  | {
      totalMs?: number;
      stepMs?: number;
      chunkMs?: number;
      toolMs?: number;
    };

export type AgentRunStatus = "completed" | "cancelled" | "failed";

export interface AgentRunCompletion {
  status: AgentRunStatus;
  text?: string;
  error?: unknown;
  messages?: AgentTranscriptMessage[];
  isAborted: boolean;
}

export interface AgentRunResult {
  /** UI messages are a transport projection, never the canonical transcript. */
  stream: ReadableStream<any>;
  /** Resolves after the UI stream reaches a terminal state. */
  completion: Promise<AgentRunCompletion>;
}

export interface AgentRunnerInput {
  modelConfig: ModelConfig;
  transcript: AgentTranscriptMessage[];
  workspace: WorkspaceWorkbookSummary[];
  tools: readonly AgentToolDefinition[];
  toolExecutor: ToolExecutor;
  /** Agent treats this value as opaque and passes it to ToolExecutor. */
  executionContext?: unknown;
  abortSignal?: AbortSignal;
  maxRetries?: number;
  timeout?: AgentTimeoutConfiguration;
  contextWindowTokens?: number;
  outputReserveTokens?: number;
  maxConversationTurns?: number;
  maxUserInputTokens?: number;
  prepareStep?: (...args: any[]) => unknown;
  onStepFinish?: (...args: any[]) => void | Promise<void>;
  onFinish?: (...args: any[]) => void | Promise<void>;
  onAbort?: (...args: any[]) => void | Promise<void>;
  onError?: (...args: any[]) => void | Promise<void>;
  onEnd?: (event: {
    messages: AgentTranscriptMessage[];
    isAborted: boolean;
  }) => void | Promise<void>;
  eventSink?: AgentEventSink;
  persistenceBarrier?: PersistenceBarrier;
}
