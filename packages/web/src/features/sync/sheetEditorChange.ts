import type { SheetChangeDelta, SheetChangeVersion } from "@openexcel/core";
import type { WorkbookFull } from "@/api/workbooks";
import type { SheetChangeSet } from "./sheetChangeSet";
import type { SheetSnapshotForSave } from "./sheetChunkSnapshot";

export type SheetEditorChange =
  | {
      kind: "patch";
      sheetId: number;
      changeSet: SheetChangeSet;
    }
  | {
      kind: "snapshot";
      sheetId: number;
      snapshot: SheetSnapshotForSave;
    };

export type SheetContentChangeHandler = (
  change: SheetEditorChange,
) => WorkbookFull | null | undefined;

export type CommittedSheetContentChangeHandler = (
  change: Extract<SheetEditorChange, { kind: "patch" }>,
  revision: number,
) => WorkbookFull | null | undefined;

export type CommittedSheetMutationHandler = (
  sheetId: number,
  delta: SheetChangeDelta,
  version: SheetChangeVersion,
) => Promise<void>;
