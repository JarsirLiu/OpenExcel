import type { WorkspaceWorkbookSummary } from "@openexcel/agent";
import {
  type ChatReference,
  type ChatReferenceTarget,
  chatReferenceDataSchema,
  chatReferenceSchema,
} from "@openexcel/chat-contracts";

function resolveReference(
  target: ChatReferenceTarget,
  workbooks: WorkspaceWorkbookSummary[],
): ChatReference | null {
  if (target.kind === "workbook") {
    const workbook = workbooks.find((item) => item.id === target.workbookId);
    return workbook
      ? {
          kind: "workbook",
          workbookId: workbook.id,
          workbookName: workbook.name,
        }
      : null;
  }

  for (const workbook of workbooks) {
    const sheet = workbook.sheets.find((item) => item.id === target.sheetId);
    if (sheet) {
      return {
        kind: "sheet",
        workbookId: workbook.id,
        workbookName: workbook.name,
        sheetId: sheet.id,
        sheetName: sheet.name,
        ...(sheet.sheetNo == null ? {} : { sheetNo: sheet.sheetNo }),
      };
    }
  }

  return null;
}

function resolveMessageParts(parts: unknown[], workbooks: WorkspaceWorkbookSummary[]) {
  return parts.map((part) => {
    if (typeof part !== "object" || part === null) return part;
    const record = part as Record<string, unknown>;
    if (record.type !== "data-chat-reference") return part;

    const parsed = chatReferenceDataSchema.safeParse(record.data);
    if (!parsed.success) return part;

    const target = parsed.data.reference;
    const resolved = chatReferenceSchema.safeParse(target).success
      ? resolveReference(
          target.kind === "workbook"
            ? { kind: "workbook", workbookId: target.workbookId }
            : { kind: "sheet", sheetId: target.sheetId },
          workbooks,
        )
      : resolveReference(target, workbooks);

    return {
      ...record,
      data: {
        reference: resolved ?? target,
        status: resolved ? "resolved" : "unavailable",
      },
    };
  });
}

export function resolveChatMessageReferences(
  messages: Array<Record<string, unknown>>,
  workbooks: WorkspaceWorkbookSummary[],
): Array<Record<string, unknown>> {
  return messages.map((message) => {
    if (!Array.isArray(message?.parts)) return message;
    return {
      ...message,
      parts: resolveMessageParts(message.parts, workbooks),
    };
  });
}
