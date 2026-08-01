import type { z } from "zod";
import type { ModelConfig } from "../model.js";
import type { WorkspaceWorkbookSummary } from "../session/context.js";
import type { ModelStepBudgetEvent } from "../session/tokenBudget.js";
import type {
  ContextCheckpointStore,
  ContextCompactionPolicy,
} from "./context/compaction/types.js";
import type { ContextTranscriptEntry } from "./context/transcript.js";
import type {
  AgentEvent,
  AgentEventSink,
  AgentEventType,
  PersistenceBarrier,
} from "./events/types.js";

export type AgentTranscriptMessage = Record<string, unknown>;

export type AgentToolExecutionMode = "read" | "mutation";

export interface AgentToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  /** Mutation tools are admitted at most once in a model step. */
  executionMode?: AgentToolExecutionMode;
}

export interface ToolExecutionRequest {
  toolName: string;
  toolCallId: string;
  input: unknown;
  abortSignal?: AbortSignal;
  context: unknown;
}

export interface ToolExecutor {
  execute(request: ToolExecutionRequest): Promise<unknown>;
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
export type AgentFailurePhase = "model" | "tool" | "persistence";

export interface AgentRunCompletion {
  status: AgentRunStatus;
  text?: string;
  error?: unknown;
  messages?: AgentTranscriptMessage[];
  isAborted: boolean;
  failureKind?: AgentFailureKind;
  failurePhase?: AgentFailurePhase;
  failureStepIndex?: number;
}

export interface AgentRunResult {
  /** Completion is independent from the HTTP subscriber. Events are emitted through AgentEventSink. */
  completion: Promise<AgentRunCompletion>;
}

export interface AgentRunnerInput {
  turnId?: string;
  modelConfig: ModelConfig;
  transcript: ContextTranscriptEntry<AgentTranscriptMessage>[];
  workspace: WorkspaceWorkbookSummary[];
  toolCatalog: string;
  tools: readonly AgentToolDefinition[];
  toolExecutor: ToolExecutor;
  executionContext?: unknown;
  abortSignal?: AbortSignal;
  maxRetries?: number;
  timeout?: AgentTimeoutConfiguration;
  contextWindowTokens?: number;
  outputReserveTokens?: number;
  maxUserInputTokens?: number;
  compaction?: ContextCompactionPolicy;
  compactionCheckpointStore?: ContextCheckpointStore;
  compactionContextKey?: string;
  externalContextRevision?: string;
  prepareStep?: (...args: any[]) => unknown;
  onModelStepFinished?: (event: ModelStepBudgetEvent) => void | Promise<void>;
  onFinish?: (...args: any[]) => void | Promise<void>;
  onAbort?: (...args: any[]) => void | Promise<void>;
  onError?: (...args: any[]) => void | Promise<void>;
  eventSink?: AgentEventSink;
  persistenceBarrier?: PersistenceBarrier;
}
