import type { SheetChangeSummary } from "../chat/sheetChange.js";
import type { SheetMutation } from "./sheetMutation.js";
import type { SheetSnapshot } from "./sheetSnapshot.js";

export type SheetCommandBase = {
  mutationId: string;
  sheetId: number;
  baseRevision: number;
};

export type SheetChunkReplacement = {
  chunkRow: number;
  chunkCol: number;
  payload: string | null;
};

export type SheetCommand =
  | (SheetCommandBase & { kind: "mutation"; mutation: SheetMutation })
  | (SheetCommandBase & { kind: "replaceSnapshot"; snapshot: SheetSnapshot })
  | (SheetCommandBase & {
      kind: "replaceChunks";
      config: Record<string, unknown> | null;
      chunks: SheetChunkReplacement[];
    });

export type SheetCommandResult = {
  mutationId: string;
  sheetId: number;
  baseRevision: number;
  revision: number;
  mutation: SheetMutation | null;
  changeSummary: SheetChangeSummary;
  snapshot: SheetSnapshot | null;
};

export type SheetCommandReceipt = Omit<SheetCommandResult, "snapshot">;
