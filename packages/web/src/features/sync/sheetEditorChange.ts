import type { SheetChangeDelta } from "@openexcel/core";
import type { WorkbookFull } from "@/api/workbooks";
import type { SheetSnapshotForSave } from "./sheetChunkSnapshot";

export type SheetEditorChange =
  | {
      kind: "patch";
      sheetId: number;
      mutation: Extract<SheetChangeDelta, { type: "patch" }>;
    }
  | {
      kind: "snapshot";
      sheetId: number;
      snapshot: SheetSnapshotForSave;
    };

export type SheetContentChangeHandler = (
  change: SheetEditorChange,
) => WorkbookFull | null | undefined;
