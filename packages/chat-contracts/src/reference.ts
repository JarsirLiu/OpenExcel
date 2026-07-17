import { z } from "zod";

const positiveIdSchema = z.number().int().positive();

export const chatReferenceTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("workbook"),
    workbookId: positiveIdSchema,
  }),
  z.object({
    kind: z.literal("sheet"),
    sheetId: positiveIdSchema,
  }),
]);

export const chatReferenceSchema = z.discriminatedUnion("kind", [
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

export const chatReferenceDataSchema = z.object({
  reference: z.union([chatReferenceSchema, chatReferenceTargetSchema]),
  status: z.enum(["resolved", "unavailable"]).optional(),
});

export type ChatReferenceTarget = z.infer<typeof chatReferenceTargetSchema>;
export type ChatReference = z.infer<typeof chatReferenceSchema>;
export type ChatReferenceData = z.infer<typeof chatReferenceDataSchema>;

export function formatChatReference(reference: ChatReference): string {
  if (reference.kind === "workbook") {
    return `[用户明确引用的工作簿: ${reference.workbookName} (workbookId=${reference.workbookId})]`;
  }

  const sheetNumber = reference.sheetNo == null ? "" : `, sheetNo=${reference.sheetNo}`;
  return `[用户明确引用的 Sheet: ${reference.workbookName} / ${reference.sheetName} (workbookId=${reference.workbookId}, sheetId=${reference.sheetId}${sheetNumber})]`;
}

export function formatUnavailableChatReference(
  target: ChatReferenceTarget | ChatReference,
): string {
  const targetId =
    target.kind === "workbook" ? `workbookId=${target.workbookId}` : `sheetId=${target.sheetId}`;
  return `[用户明确引用的目标已不存在 (${targetId})，不要猜测其他工作簿或 Sheet]`;
}
