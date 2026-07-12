export const DEFAULT_CONTEXT_WINDOW_TOKENS = 180_000;
export const DEFAULT_OUTPUT_RESERVE_TOKENS = 16_000;

type MessageLike = {
  role?: unknown;
  content?: unknown;
  parts?: ReadonlyArray<unknown> | null;
  [key: string]: unknown;
};

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}

/** Conservative provider-independent estimate for chat JSON and mixed Chinese text. */
export function estimateTokens(value: unknown): number {
  const text = typeof value === "string" ? value : stringify(value);
  let tokens = 0;

  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x7f) {
      tokens += /[\s]/u.test(char) ? 0.25 : 0.34;
    } else if (
      (code >= 0x2e80 && code <= 0x9fff) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0x20000 && code <= 0x3134f)
    ) {
      tokens += 0.75;
    } else {
      tokens += 0.75;
    }
  }

  return Math.max(1, Math.ceil(tokens));
}

function truncateText(text: string, maxTokens: number): string {
  const maxCharacters = Math.max(1, Math.floor(maxTokens * 1.25));
  if (text.length <= maxCharacters) return text;
  return `${text.slice(0, Math.max(1, maxCharacters - 20))}\n[内容已按上下文预算截断]`;
}

function truncateLatestMessage(message: MessageLike, maxTokens: number): MessageLike {
  const maxTextTokens = Math.max(1, maxTokens - estimateTokens({ role: message.role }));
  if (typeof message.content === "string") {
    return { ...message, content: truncateText(message.content, maxTextTokens) };
  }

  if (Array.isArray(message.parts)) {
    return {
      ...message,
      parts: message.parts.map((part) => {
        if (typeof part !== "object" || part === null) return part;
        const candidate = part as Record<string, unknown>;
        if (typeof candidate.text === "string") {
          return { ...candidate, text: truncateText(candidate.text, maxTextTokens) };
        }
        return part;
      }),
    };
  }

  return message;
}

export interface ContextWindowOptions {
  contextWindowTokens?: number;
  outputReserveTokens?: number;
  systemPrompt?: string;
}

export interface ContextWindowResult<T> {
  messages: T[];
  estimatedTokens: number;
  droppedMessages: number;
  budgetTokens: number;
}

/** Keeps a contiguous recent transcript so tool calls and their results stay paired. */
export function trimMessagesToContextWindow<T extends MessageLike>(
  messages: T[],
  options: ContextWindowOptions = {},
): ContextWindowResult<T> {
  const contextWindowTokens = Math.max(
    1,
    options.contextWindowTokens ?? DEFAULT_CONTEXT_WINDOW_TOKENS,
  );
  const outputReserveTokens = Math.max(
    0,
    options.outputReserveTokens ?? DEFAULT_OUTPUT_RESERVE_TOKENS,
  );
  const systemTokens = options.systemPrompt ? estimateTokens(options.systemPrompt) : 0;
  const budgetTokens = Math.max(1, contextWindowTokens - outputReserveTokens - systemTokens);

  const selected: T[] = [];
  let estimatedTokens = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const messageTokens = estimateTokens(message);
    if (selected.length === 0 && messageTokens > budgetTokens) {
      const latest = truncateLatestMessage(message, budgetTokens) as T;
      selected.unshift(latest);
      estimatedTokens = Math.min(budgetTokens, estimateTokens(latest));
      break;
    }
    if (estimatedTokens + messageTokens > budgetTokens) break;
    selected.unshift(message);
    estimatedTokens += messageTokens;
  }

  return {
    messages: selected,
    estimatedTokens,
    droppedMessages: messages.length - selected.length,
    budgetTokens,
  };
}
