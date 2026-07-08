export function getMessageText(message: any): string {
  if (typeof message?.content === "string") return message.content;
  if (Array.isArray(message?.parts)) {
    return message.parts
      .filter((part: any) => part.type === "text")
      .map((part: any) => part.text)
      .join("");
  }
  return "";
}

export function getFirstUserText(messages: any[]): string {
  for (const message of messages) {
    if (message?.role === "user") {
      return getMessageText(message);
    }
  }
  return "";
}