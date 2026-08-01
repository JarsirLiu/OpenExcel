import { z } from "zod";
import { sheetChangeDeltaSchema, sheetChangeSummarySchema } from "../chat/sheetChange.js";

export const sheetSnapshotSchema = z.object({
  celldata: z.array(
    z
      .object({
        r: z.number().int().nonnegative(),
        c: z.number().int().nonnegative(),
        v: z.record(z.string(), z.unknown()),
      })
      .passthrough(),
  ),
  config: z.record(z.string(), z.unknown()).nullable(),
});

export const sheetMutationSchema = sheetChangeDeltaSchema;

export const sheetCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("mutation"),
    mutationId: z.string().trim().min(1),
    sheetId: z.number().int().positive(),
    baseRevision: z.number().int().nonnegative(),
    mutation: sheetChangeDeltaSchema,
  }),
  z.object({
    kind: z.literal("replaceSnapshot"),
    mutationId: z.string().trim().min(1),
    sheetId: z.number().int().positive(),
    baseRevision: z.number().int().nonnegative(),
    snapshot: sheetSnapshotSchema,
  }),
  z.object({
    kind: z.literal("replaceChunks"),
    mutationId: z.string().trim().min(1),
    sheetId: z.number().int().positive(),
    baseRevision: z.number().int().nonnegative(),
    config: z.record(z.string(), z.unknown()).nullable(),
    chunks: z.array(
      z.object({
        chunkRow: z.number().int().nonnegative(),
        chunkCol: z.number().int().nonnegative(),
        payload: z.string().nullable(),
      }),
    ),
  }),
]);

export const sheetCommandResultSchema = z.object({
  mutationId: z.string().trim().min(1),
  sheetId: z.number().int().positive(),
  baseRevision: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  mutation: sheetMutationSchema.nullable(),
  changeSummary: sheetChangeSummarySchema,
  snapshot: sheetSnapshotSchema.nullable(),
});

export const sheetCommandReceiptSchema = sheetCommandResultSchema.omit({ snapshot: true });
