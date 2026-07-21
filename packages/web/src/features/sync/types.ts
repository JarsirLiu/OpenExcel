import type { SheetChangeDelta, SheetChangeVersion } from "@openexcel/core";

export type SheetPatchUpdate = {
  toolCallId: string;
  sheetId: number;
  sheetNo?: number;
  delta: SheetChangeDelta | null;
  version?: SheetChangeVersion;
};

export type WorkbookCreatedUpdate = {
  toolCallId: string;
  kind: "workbook-created";
  workbookId: number;
  workbookName: string;
  order: number;
  sourceSheetId: number | null;
  initialSheet: {
    id: number;
    sheetNo: number;
    name: string;
    order: number;
  };
};

export type SheetCreatedUpdate = {
  toolCallId: string;
  kind: "sheet-created";
  workbookId: number;
  sheetId: number;
  sheetNo?: number;
  sheetName: string;
  order: number;
  sourceSheetId: number | null;
};

export type SheetDeletedUpdate = {
  toolCallId: string;
  kind: "sheet-deleted";
  workbookId: number;
  sheetId: number;
  sheetNo?: number;
  order: number;
};

export type WorkbookStructureUpdate =
  | WorkbookCreatedUpdate
  | SheetCreatedUpdate
  | SheetDeletedUpdate;
