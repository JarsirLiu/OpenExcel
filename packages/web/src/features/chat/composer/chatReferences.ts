import { type ChatReferenceTarget, chatReferenceTargetSchema } from "@openexcel/chat-contracts";

function parseMentionTarget(id: unknown): ChatReferenceTarget | null {
  if (typeof id !== "string") return null;

  const separator = id.indexOf(":");
  if (separator <= 0) return null;

  const kind = id.slice(0, separator);
  const numericId = Number(id.slice(separator + 1));
  const candidate =
    kind === "sheet"
      ? { kind: "sheet" as const, sheetId: numericId }
      : kind === "workbook"
        ? { kind: "workbook" as const, workbookId: numericId }
        : null;
  if (!candidate) return null;

  const parsed = chatReferenceTargetSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function extractChatReferences(document: unknown): ChatReferenceTarget[] {
  const references: ChatReferenceTarget[] = [];
  const seen = new Set<string>();

  const visit = (node: unknown) => {
    if (typeof node !== "object" || node === null) return;
    const record = node as Record<string, unknown>;
    if (record.type === "mention") {
      const attrs = record.attrs;
      const id =
        typeof attrs === "object" && attrs !== null ? (attrs as Record<string, unknown>).id : null;
      const reference = parseMentionTarget(id);
      if (reference) {
        const key = JSON.stringify(reference);
        if (!seen.has(key)) {
          seen.add(key);
          references.push(reference);
        }
      }
    }

    const content = record.content;
    if (Array.isArray(content)) {
      for (const child of content) visit(child);
    }
  };

  visit(document);
  return references;
}
