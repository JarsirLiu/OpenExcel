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

export function cleanMessages(messages: any[]): { role: "user" | "assistant"; content: string }[] {
  return messages.map((m: any) => ({
    role: m.role as "user" | "assistant",
    content: stripRefs(getMessageText(m)),
  }));
}