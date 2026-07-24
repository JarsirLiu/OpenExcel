import type { z } from "zod";
import type { ModelConfig } from "../model.js";
import type { WorkspaceWorkbookSummary } from "../session/context.js";
import type {
  AgentEvent,
  AgentEventSink,
  AgentEventType,
  PersistenceBarrier,
} from "./events/types.js";

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

export type { AgentEvent, AgentEventSink, AgentEventType, PersistenceBarrier };

export type AgentTimeoutConfiguration =
  | number
  | {
      totalMs?: number;
      stepMs?: number;
      chunkMs?: number;
      toolMs?: number;
    };

export type AgentRunStatus = "completed" | "cancelled" | "failed";

export type AgentFailureKind = "execution" | "persistence";

export interface AgentRunCompletion {
  status: AgentRunStatus;
  text?: string;
  error?: unknown;
  messages?: AgentTranscriptMessage[];
  isAborted: boolean;
  failureKind?: AgentFailureKind;
}

export interface AgentRunResult {
  stream: ReadableStream<any>;
  completion: Promise<AgentRunCompletion>;
}

export interface CompactionOptions {
  enabled?: boolean;
  minTurnsToCompact?: number;
  maxTurnsAfterCompact?: number;
}

export interface AgentRunnerInput {
  modelConfig: ModelConfig;
  transcript: AgentTranscriptMessage[];
  workspace: WorkspaceWorkbookSummary[];
  tools: readonly AgentToolDefinition[];
  toolExecutor: ToolExecutor;
  executionContext?: unknown;
  abortSignal?: AbortSignal;
  maxRetries?: number;
  timeout?: AgentTimeoutConfiguration;
  contextWindowTokens?: number;
  outputReserveTokens?: number;
  maxConversationTurns?: number;
  maxUserInputTokens?: number;
  compaction?: CompactionOptions;
  prepareStep?: (...args: any[]) => unknown;
  onStepFinish?: (...args: any[]) => void | Promise<void>;
  onFinish?: (...args: any[]) => void | Promise<void>;
  onAbort?: (...args: any[]) => void | Promise<void>;
  onError?: (...args: any[]) => void | Promise<void>;
  eventSink?: AgentEventSink;
  persistenceBarrier?: PersistenceBarrier;
}
