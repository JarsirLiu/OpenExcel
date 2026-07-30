import type { SheetChangeSummary } from "../chat/sheetChange.js";
import type { SheetMutation } from "./sheetMutation.js";
import type { SheetSnapshot } from "./sheetSnapshot.js";

export type SheetCommandBase = {
  mutationId: string;
  sheetId: number;
  baseRevision: number;
};

export type SheetCommand =
  | (SheetCommandBase & { kind: "mutation"; mutation: SheetMutation })
  | (SheetCommandBase & { kind: "replaceSnapshot"; snapshot: SheetSnapshot });

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
