import type { LanguageModel } from "ai";
import { estimateModelContextTokens } from "../../session/contextWindow.js";
import type { ModelStepBudgetEvent } from "../../session/tokenBudget.js";
import { appendResponseMessages } from "../../session/transcript.js";
import type { AgentToolDefinition, AgentTranscriptMessage } from "../contracts.js";
import { createContextBudgetPlan, shouldCompact } from "./compaction/budgetPlanner.js";
import { ContextCompactionEngine } from "./compaction/engine.js";
import { createContextSummaryGenerator } from "./compaction/modelSummary.js";
import {
  type ContextCompactionPolicy,
  DEFAULT_CONTEXT_COMPACTION_POLICY,
} from "./compaction/types.js";
import { type AssembledModelContext, assembleModelContext } from "./modelContextAssembler.js";
import {
  type ContextTranscriptEntry,
  messagesFromTranscript,
  validateTranscriptEntries,
} from "./transcript.js";

export interface ContextCompactionCoordinatorOptions {
  contextKey: string;
  transcript: readonly ContextTranscriptEntry<AgentTranscriptMessage>[];
  initialMessages: readonly AgentTranscriptMessage[];
  baseSystemPrompt: string;
  model: LanguageModel;
  tools: readonly AgentToolDefinition[];
  checkpointStore: import("./compaction/types.js").ContextCheckpointStore;
  contextWindowTokens: number;
  policy?: Partial<ContextCompactionPolicy>;
  externalContextRevision?: string;
  sourceRunId?: string;
  signal?: AbortSignal;
  convertToModelMessages: (
    messages: readonly AgentTranscriptMessage[],
  ) => Promise<readonly unknown[]>;
  onCompactionStarted?: () => void | Promise<void>;
  onCompactionCompleted?: (
    checkpoint: import("./compaction/types.js").ContextCheckpoint,
  ) => void | Promise<void>;
  onCompactionFailed?: (error: unknown) => void | Promise<void>;
  resetTokenBaseline: () => void;
}

export interface PrepareContextInput {
  messages: unknown;
  instructions: unknown;
  activeTools: readonly string[] | undefined;
}

export interface PreparedContext {
  system: string;
  messages: readonly unknown[];
  activeTools: readonly string[] | undefined;
}

/** Owns compaction state between SDK step callbacks. */
export class ContextCompactionCoordinator {
  private readonly policy: ContextCompactionPolicy;
  private readonly engine: ContextCompactionEngine;
  private readonly allEntries: ContextTranscriptEntry<AgentTranscriptMessage>[];
  private lastStep?: ModelStepBudgetEvent;
  private checkpoint?: import("./compaction/types.js").ContextCheckpoint;

  constructor(private readonly options: ContextCompactionCoordinatorOptions) {
    this.policy = { ...DEFAULT_CONTEXT_COMPACTION_POLICY, ...options.policy };
    this.allEntries = options.transcript.map((entry) => ({ ...entry }));
    validateTranscriptEntries(this.allEntries);
    const summaryGenerator = createContextSummaryGenerator({
      model: options.model,
      maxOutputTokens: this.policy.summaryMaxTokens,
    });
    this.engine = new ContextCompactionEngine({
      checkpointStore: options.checkpointStore,
      summaryGenerator,
      policy: this.policy,
      sourceTranscriptHash: (entries) => JSON.stringify(entries),
    });
  }

  async initialize(): Promise<PreparedContext> {
    this.checkpoint =
      (await this.options.checkpointStore.load(this.options.contextKey)) ?? undefined;
    if (this.checkpoint) {
      const recentEntries = this.allEntries.filter(
        (entry) => entry.cursor > this.checkpoint!.coveredTranscriptCursor,
      );
      const assembled = this.assemble(
        this.checkpoint.summary,
        messagesFromTranscript(recentEntries),
        this.options.tools,
      );
      return {
        system: assembled.system,
        messages: await this.options.convertToModelMessages(
          assembled.messages as AgentTranscriptMessage[],
        ),
        activeTools: undefined,
      };
    }

    const assembled = this.assemble(undefined, this.options.initialMessages, this.options.tools);
    return {
      system: assembled.system,
      messages: await this.options.convertToModelMessages(
        assembled.messages as AgentTranscriptMessage[],
      ),
      activeTools: undefined,
    };
  }

  recordStepFinished(event: ModelStepBudgetEvent): void {
    this.lastStep = event;
    if (!Array.isArray(event.responseMessages)) return;
    const messages = messagesFromTranscript(this.allEntries) as AgentTranscriptMessage[];
    const updated = appendResponseMessages(messages, event.responseMessages);
    const newMessages = updated.slice(messages.length);
    let nextCursor = this.allEntries.at(-1)?.cursor ?? -1;
    for (const message of newMessages) {
      nextCursor += 1;
      this.allEntries.push({ cursor: nextCursor, message });
    }
  }

  async prepare(input: PrepareContextInput, force = false): Promise<PreparedContext | undefined> {
    const activeTools = input.activeTools;
    if (!this.lastStep && !force) return undefined;

    const plan = createContextBudgetPlan(this.options.contextWindowTokens, this.policy);
    const actualTools = this.options.tools
      .filter((tool) => activeTools === undefined || activeTools.includes(tool.name))
      .map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
    const estimatedContextTokens = estimateModelContextTokens({
      messages: input.messages,
      systemPrompt: input.instructions,
      toolDefinitions: actualTools,
    });
    const predictedInputTokens = this.lastStep?.usage
      ? Math.max(
          0,
          this.lastStep.usage.inputTokens +
            estimatedContextTokens -
            this.lastStep.estimatedContextTokens,
        )
      : estimatedContextTokens;
    if (!force && !shouldCompact(predictedInputTokens, plan)) return undefined;

    await this.options.onCompactionStarted?.();
    let completed = false;
    try {
      const result = await this.engine.compact({
        contextKey: this.options.contextKey,
        transcript: this.allEntries,
        contextWindowTokens: this.options.contextWindowTokens,
        modelContext: { systemPrompt: this.options.baseSystemPrompt, toolDefinitions: actualTools },
        predictedInputTokens,
        externalContextRevision: this.options.externalContextRevision,
        sourceRunId: this.options.sourceRunId,
        signal: this.options.signal,
      });
      this.checkpoint = result.checkpoint;
      const assembled = this.assemble(
        result.checkpoint.summary,
        result.recentMessages as AgentTranscriptMessage[],
        actualTools,
      );
      const messages = await this.options.convertToModelMessages(
        assembled.messages as AgentTranscriptMessage[],
      );
      this.lastStep = undefined;
      this.options.resetTokenBaseline();
      await this.options.onCompactionCompleted?.(result.checkpoint);
      completed = true;
      return {
        system: assembled.system,
        messages,
        activeTools,
      };
    } catch (error) {
      if (!completed) await this.options.onCompactionFailed?.(error);
      throw error;
    }
  }

  private assemble(
    summary: import("./compaction/types.js").ContextSummary | undefined,
    messages: readonly unknown[],
    actualToolDefinitions: readonly unknown[],
  ): AssembledModelContext {
    return assembleModelContext({
      baseSystemPrompt: this.options.baseSystemPrompt,
      summary,
      recentMessages: messages,
      actualToolDefinitions,
    });
  }
}
