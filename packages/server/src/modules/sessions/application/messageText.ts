type ChatMessageLike = {
  role?: unknown;
  content?: unknown;
  parts?: ReadonlyArray<unknown> | null;
};

export function extractMessageText(message: ChatMessageLike): string {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.parts)) return "";

  return message.parts
    .filter((part: any) => part?.type === "text" && typeof part.text === "string")
    .map((part: any) => part.text)
    .join("");
}

export function extractFirstUserText(messages: any[]): string {
  for (const message of messages) {
    if (message?.role === "user") return extractMessageText(message);
  }
  return "";
}

export function extractLatestUserText(messages: any[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") return extractMessageText(message);
  }
  return "";
}
