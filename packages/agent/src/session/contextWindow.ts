export const DEFAULT_CONTEXT_WINDOW_TOKENS = 180_000;
export const DEFAULT_OUTPUT_RESERVE_TOKENS = 16_000;
export const DEFAULT_MAX_CONVERSATION_TURNS = 20;
export const DEFAULT_MAX_USER_INPUT_TOKENS = 16_000;

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
  if (estimateTokens(text) <= maxTokens) return text;

  let end = Math.max(1, Math.floor(text.length * 0.75));
  let result = `${text.slice(0, end)}\n[内容已按上下文预算截断]`;
  while (estimateTokens(result) > maxTokens && end > 1) {
    end = Math.max(1, Math.floor(end * 0.75));
    result = `${text.slice(0, end)}\n[内容已按上下文预算截断]`;
  }
  return estimateTokens(result) <= maxTokens ? result : "[内容已截断]";
}

function fitMessageToTokens(message: MessageLike, maxTokens: number): MessageLike {
  if (estimateTokens(message) <= maxTokens) return message;

  if (typeof message.content === "string") {
    let textBudget = Math.max(1, maxTokens - estimateTokens({ role: message.role }));
    let result: MessageLike = {
      ...message,
      content: truncateText(message.content, textBudget),
    };
    while (estimateTokens(result) > maxTokens && textBudget > 1) {
      textBudget = Math.max(1, Math.floor(textBudget * 0.75));
      result = { ...message, content: truncateText(message.content, textBudget) };
    }
    return estimateTokens(result) <= maxTokens ? result : { ...message, content: "[内容已截断]" };
  }

  if (Array.isArray(message.parts)) {
    let result: MessageLike = { ...message };
    while (estimateTokens(result) > maxTokens) {
      const parts = Array.isArray(result.parts) ? [...result.parts] : [];
      let index = -1;
      for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
        const part = parts[partIndex];
        if (
          typeof part === "object" &&
          part !== null &&
          typeof (part as Record<string, unknown>).text === "string" &&
          ((part as Record<string, unknown>).text as string).length > 1
        ) {
          index = partIndex;
          break;
        }
      }
      if (index < 0) break;
      const part = parts[index] as Record<string, unknown>;
      const text = part.text as string;
      parts[index] = {
        ...part,
        text: truncateText(text, Math.max(1, Math.floor(estimateTokens(text) * 0.75))),
      };
      result = { ...result, parts };
    }
    return estimateTokens(result) <= maxTokens
      ? result
      : { ...message, parts: [{ type: "text", text: "[内容已截断]" }] };
  }

  return { ...message, content: "[内容已截断]" };
}

function truncateMessageToTokens(message: MessageLike, maxTokens: number): MessageLike {
  if (estimateTokens(message) <= maxTokens) return message;

  const maxTextTokens = Math.max(1, maxTokens - estimateTokens({ role: message.role }));
  if (typeof message.content === "string") {
    return fitMessageToTokens(
      { ...message, content: truncateText(message.content, maxTextTokens) },
      maxTokens,
    );
  }

  if (Array.isArray(message.parts)) {
    let remainingTokens = maxTextTokens;
    return fitMessageToTokens(
      {
        ...message,
        parts: message.parts.map((part) => {
          if (typeof part !== "object" || part === null) return part;
          const candidate = part as Record<string, unknown>;
          if (typeof candidate.text === "string") {
            const text = truncateText(candidate.text, remainingTokens);
            remainingTokens = Math.max(1, remainingTokens - estimateTokens(text));
            return { ...candidate, text };
          }
          return part;
        }),
      },
      maxTokens,
    );
  }

  return fitMessageToTokens(message, maxTokens);
}

function limitUserMessages<T extends MessageLike>(
  messages: T[],
  maxUserInputTokens: number,
): { messages: T[]; truncatedCount: number } {
  let truncatedCount = 0;
  const normalized = messages.map((message) => {
    if (message.role !== "user" || estimateTokens(message) <= maxUserInputTokens) return message;
    truncatedCount += 1;
    return truncateMessageToTokens(message, maxUserInputTokens) as T;
  });
  return { messages: normalized, truncatedCount };
}

function truncateLatestTurn<T extends MessageLike>(turn: T[], maxTokens: number): T[] {
  let latestUserIndex = -1;
  for (let index = turn.length - 1; index >= 0; index -= 1) {
    if (turn[index].role === "user") {
      latestUserIndex = index;
      break;
    }
  }
  const priorityIndex = latestUserIndex >= 0 ? latestUserIndex : turn.length - 1;
  const priorityMessage = turn[priorityIndex];
  if (!priorityMessage) return [];

  const priorityTokens = estimateTokens(priorityMessage);
  const selected = new Map<number, T>();
  selected.set(
    priorityIndex,
    (priorityTokens > maxTokens
      ? truncateMessageToTokens(priorityMessage, maxTokens)
      : priorityMessage) as T,
  );

  for (let index = priorityIndex + 1; index < turn.length; index += 1) {
    const candidate = turn[index];
    const candidateMap = new Map(selected);
    candidateMap.set(index, candidate);
    const candidateMessages = [...candidateMap.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, message]) => message);
    if (estimateTokens(candidateMessages) <= maxTokens) selected.set(index, candidate);
  }

  return [...selected.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, message]) => message);
}

export interface ContextWindowOptions {
  contextWindowTokens?: number;
  outputReserveTokens?: number;
  systemPrompt?: string;
  maxConversationTurns?: number;
  maxUserInputTokens?: number;
}

export interface ContextWindowResult<T> {
  messages: T[];
  estimatedTokens: number;
  droppedMessages: number;
  droppedTurns: number;
  conversationTurns: number;
  truncatedUserMessages: number;
  budgetTokens: number;
}

function groupConversationTurns<T extends MessageLike>(messages: T[]): T[][] {
  const groups: T[][] = [];
  let current: T[] = [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    current.unshift(message);
    if (message.role === "user") {
      groups.unshift(current);
      current = [];
    }
  }

  if (current.length > 0) groups.unshift(current);
  return groups;
}

/** Keeps complete recent turns so tool calls and their results stay paired. */
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
  const maxConversationTurns = Math.max(
    1,
    options.maxConversationTurns ?? DEFAULT_MAX_CONVERSATION_TURNS,
  );
  const maxUserInputTokens = Math.max(
    1,
    options.maxUserInputTokens ?? DEFAULT_MAX_USER_INPUT_TOKENS,
  );
  const normalized = limitUserMessages(messages, maxUserInputTokens);
  const allTurns = groupConversationTurns(normalized.messages);
  const turnGroups = allTurns.filter((group) => group.some((message) => message.role === "user"));
  const recentTurns = turnGroups.slice(-maxConversationTurns);

  const selected: T[] = [];
  let estimatedTokens = 0;
  for (let index = recentTurns.length - 1; index >= 0; index -= 1) {
    const turn = recentTurns[index];
    const turnTokens = estimateTokens(turn);
    if (selected.length === 0 && turnTokens > budgetTokens) {
      const latestTurn = truncateLatestTurn(turn, budgetTokens);
      selected.unshift(...latestTurn);
      estimatedTokens = Math.min(budgetTokens, estimateTokens(latestTurn));
      break;
    }
    if (estimatedTokens + turnTokens > budgetTokens) break;
    selected.unshift(...turn);
    estimatedTokens += turnTokens;
  }

  return {
    messages: selected,
    estimatedTokens,
    droppedMessages: messages.length - selected.length,
    droppedTurns: Math.max(
      0,
      turnGroups.length - selected.filter((message) => message.role === "user").length,
    ),
    conversationTurns: selected.filter((message) => message.role === "user").length,
    truncatedUserMessages: normalized.truncatedCount,
    budgetTokens,
  };
}
