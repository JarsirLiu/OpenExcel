import type { WorkspaceWorkbookSummary } from "@openexcel/agent";
import { z } from "zod";

const positiveIdSchema = z.number().int().positive();
const chatReferenceTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("workbook"), workbookId: positiveIdSchema }),
  z.object({ kind: z.literal("sheet"), sheetId: positiveIdSchema }),
]);
const chatReferenceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("workbook"),
    workbookId: positiveIdSchema,
    workbookName: z.string().min(1),
  }),
  z.object({
    kind: z.literal("sheet"),
    workbookId: positiveIdSchema,
    workbookName: z.string().min(1),
    sheetId: positiveIdSchema,
    sheetName: z.string().min(1),
    sheetNo: positiveIdSchema.optional(),
  }),
]);
const chatReferenceDataSchema = z.object({
  reference: z.union([chatReferenceSchema, chatReferenceTargetSchema]),
  status: z.enum(["resolved", "unavailable"]).optional(),
});

type ChatReferenceTarget = z.infer<typeof chatReferenceTargetSchema>;
type ChatReference = z.infer<typeof chatReferenceSchema>;

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
