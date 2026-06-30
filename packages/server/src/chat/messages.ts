const MAX_TURNS = 20; // 1 turn = 1 user message + 1 assistant response

export function getMessageText(msg: any): string {
  if (msg.content) return msg.content;
  if (msg.parts && Array.isArray(msg.parts)) {
    return msg.parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("");
  }
  return "";
}

export function stripRefs(content: string): string {
  return content.replace(/\[ref:\w+:\d+\]/g, "");
}

/**
 * 限制消息历史为最近 MAX_TURNS 轮对话。
 * 返回的数组包含 systemPrompt + 最后 MAX_TURNS*2 条消息。
 */
export function limitTurns(messages: { role: string; content: string }[]): { role: "user" | "assistant"; content: string }[] {
  if (messages.length <= MAX_TURNS * 2) {
    return messages.map((m) => ({ role: m.role, content: stripRefs(m.content) })) as any;
  }
  return messages.slice(-MAX_TURNS * 2).map((m) => ({ role: m.role, content: stripRefs(m.content) })) as any;
}