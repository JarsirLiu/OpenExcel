import { z } from "zod";

const positiveIdSchema = z.number().int().positive();

const chatReferenceTargetSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("workbook"), workbookId: positiveIdSchema }),
  z.strictObject({ kind: z.literal("sheet"), sheetId: positiveIdSchema }),
]);

const textPartSchema = z.strictObject({
  type: z.literal("text"),
  text: z.string().min(1).max(20_000),
});

const referencePartSchema = z.strictObject({
  type: z.literal("data-chat-reference"),
  data: z.strictObject({ reference: chatReferenceTargetSchema }),
});

export const chatTurnRequestSchema = z.strictObject({
  requestId: z.string().trim().min(1).max(200),
  message: z.strictObject({
    messageId: z.string().trim().min(1).max(200),
    role: z.literal("user"),
    parts: z
      .array(z.union([textPartSchema, referencePartSchema]))
      .min(1)
      .max(100),
  }),
});

export type ChatTurnRequest = z.infer<typeof chatTurnRequestSchema>;

export function parseChatTurnRequest(input: unknown): ChatTurnRequest {
  return chatTurnRequestSchema.parse(input);
}

export function toCanonicalUserMessage(request: ChatTurnRequest) {
  return {
    id: request.message.messageId,
    role: request.message.role,
    parts: request.message.parts,
  };
}

export function appendChatTurn(
  transcript: Array<Record<string, unknown>>,
  request: ChatTurnRequest,
): Array<Record<string, unknown>> {
  return [...transcript, toCanonicalUserMessage(request)];
}
