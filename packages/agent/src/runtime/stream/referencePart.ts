import { z } from "zod";

const positiveIdSchema = z.number().int().positive();
const resolvedChatReferenceSchema = z.discriminatedUnion("kind", [
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
const unavailableChatReferenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("workbook"), workbookId: positiveIdSchema }),
  z.object({ kind: z.literal("sheet"), sheetId: positiveIdSchema }),
]);
const chatReferenceDataSchema = z.object({
  reference: z.union([resolvedChatReferenceSchema, unavailableChatReferenceSchema]),
  status: z.enum(["resolved", "unavailable"]),
});

export function convertChatReferenceDataPart(part: unknown) {
  if (typeof part !== "object" || part === null) return undefined;
  const record = part as Record<string, unknown>;
  if (record.type !== "data-chat-reference") return undefined;

  const parsed = chatReferenceDataSchema.safeParse(record.data);
  if (!parsed.success) return undefined;

  if (parsed.data.status === "unavailable") {
    const targetId =
      parsed.data.reference.kind === "workbook"
        ? `workbookId=${parsed.data.reference.workbookId}`
        : `sheetId=${parsed.data.reference.sheetId}`;
    return {
      type: "text" as const,
      text: `[用户明确引用的目标已不存在 (${targetId})，不要猜测其他工作簿或 Sheet]`,
    };
  }

  const reference = resolvedChatReferenceSchema.safeParse(parsed.data.reference);
  if (!reference.success) return undefined;

  if (reference.data.kind === "workbook") {
    return {
      type: "text" as const,
      text: `[用户明确引用的工作簿: ${reference.data.workbookName} (workbookId=${reference.data.workbookId})]`,
    };
  }

  const sheetNumber = reference.data.sheetNo == null ? "" : `, sheetNo=${reference.data.sheetNo}`;
  return {
    type: "text" as const,
    text: `[用户明确引用的 Sheet: ${reference.data.workbookName} / ${reference.data.sheetName} (workbookId=${reference.data.workbookId}, sheetId=${reference.data.sheetId}${sheetNumber})]`,
  };
}
