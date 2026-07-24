import { generateText } from "ai";
import type { AgentTranscriptMessage } from "../runtime/contracts.js";
import { resolveModelForPurpose } from "../runtime/model/resolver.js";
import type { ModelConfig } from "../runtime/model/types.js";

export const COMPACTION_CHECKPOINT_MARKER = "__COMPACTION_CHECKPOINT__";

export interface CompactionConfig {
  minTurnsToCompact?: number;
  maxTurnsAfterCompact?: number;
  compactionModelName?: string;
}

export interface CompactionResult {
  compactedMessages: AgentTranscriptMessage[];
  checkpointMarker: string;
  droppedTokens: number;
  compactedTurns: number;
}

export interface Compactor {
  shouldCompact(messages: AgentTranscriptMessage[], config: CompactionConfig): boolean;
  compact(messages: AgentTranscriptMessage[], config: CompactionConfig): Promise<CompactionResult>;
}

export class ModelCompactor implements Compactor {
  constructor(private readonly model: any) {}

  shouldCompact(messages: AgentTranscriptMessage[], config: CompactionConfig): boolean {
    const userMessages = messages.filter((m) => (m as Record<string, unknown>).role === "user");
    return userMessages.length >= (config.minTurnsToCompact ?? 10);
  }

  async compact(
    messages: AgentTranscriptMessage[],
    config: CompactionConfig,
  ): Promise<CompactionResult> {
    const userMessages = messages.filter((m) => (m as Record<string, unknown>).role === "user");
    const maxTurns = config.maxTurnsAfterCompact ?? 5;

    if (userMessages.length <= maxTurns) {
      return {
        compactedMessages: messages,
        checkpointMarker: COMPACTION_CHECKPOINT_MARKER,
        droppedTokens: 0,
        compactedTurns: 0,
      };
    }

    const messagesToCompact = messages.slice(0, -maxTurns * 2);
    const recentMessages = messages.slice(-maxTurns * 2);

    const compactedText = await this.generateSummary(messagesToCompact);

    const compactedMessage: AgentTranscriptMessage = {
      role: "system",
      content: compactedText,
      metadata: {
        compactionMarker: COMPACTION_CHECKPOINT_MARKER,
        compactedTurns: Math.floor(messagesToCompact.length / 2),
      },
    };

    return {
      compactedMessages: [compactedMessage, ...recentMessages],
      checkpointMarker: COMPACTION_CHECKPOINT_MARKER,
      droppedTokens: 0,
      compactedTurns: Math.floor(messagesToCompact.length / 2),
    };
  }

  private async generateSummary(messages: AgentTranscriptMessage[]): Promise<string> {
    const messageTexts = messages.map((msg) => {
      const role = (msg as Record<string, unknown>).role as string;
      const content = (msg as Record<string, unknown>).content;
      const textContent = typeof content === "string" ? content : JSON.stringify(content);
      return `${role}: ${textContent}`;
    });

    const prompt = `请总结以下对话历史，保留关键信息、用户目标和已完成的操作。不要包含无关细节。输出格式为自然语言段落。\n\n${messageTexts.join("\n")}`;

    try {
      const { text } = await generateText({
        model: this.model,
        prompt,
        maxOutputTokens: 1024,
        temperature: 0,
      });
      return text ?? "";
    } catch (error) {
      console.error("[compaction] Failed to generate summary:", error);
      return `[对话历史已压缩，共 ${messages.length} 条消息]`;
    }
  }
}

export function createCompactor(config: ModelConfig): Compactor {
  const model = resolveModelForPurpose(config, "compaction");
  return new ModelCompactor(model);
}

export async function compactMessagesIfNeeded(
  messages: AgentTranscriptMessage[],
  config: CompactionConfig & { modelConfig: ModelConfig },
): Promise<CompactionResult> {
  const compactor = createCompactor(config.modelConfig);
  if (!compactor.shouldCompact(messages, config)) {
    return {
      compactedMessages: messages,
      checkpointMarker: COMPACTION_CHECKPOINT_MARKER,
      droppedTokens: 0,
      compactedTurns: 0,
    };
  }
  return compactor.compact(messages, config);
}
