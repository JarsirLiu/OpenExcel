import type { SheetConfig } from "@openexcel/core";
import type { SheetChangeSet } from "./sheetChangeSet";
import type { SheetChunkReplacement, SheetSnapshotForSave } from "./sheetChunkSnapshot";

export type SheetSaveResult = { revision: number; snapshot?: SheetSnapshotForSave };

export type SheetSaveInput =
  | {
      kind: "patch";
      changeSet: SheetChangeSet;
      documentVersion?: number;
    }
  | {
      kind: "snapshot";
      snapshot: SheetSnapshotForSave;
      documentVersion?: number;
    };

export type SheetSaveRequest =
  | {
      kind: "changeSet";
      baseRevision: number;
      changeSet: SheetChangeSet;
    }
  | {
      kind: "replaceChunks";
      baseRevision: number;
      config: SheetConfig | null;
      chunks: SheetChunkReplacement[];
    };

export type SheetSaveTask = (request: SheetSaveRequest) => Promise<SheetSaveResult>;
