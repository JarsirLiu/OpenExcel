import type { SheetSnapshotForSave } from "@/features/sync/sheetChunkSnapshot";
import {
  type FortuneSheetChangeResult,
  FortuneSheetEventAdapter,
} from "./FortuneSheetEventAdapter";
import type { FortuneSheetData } from "./fortuneSheet";
import type { FortuneSheetOp } from "./fortuneSheetOps";

export class ManualSheetEditor {
  private readonly eventAdapter = new FortuneSheetEventAdapter();

  reset(sheets: readonly FortuneSheetData[]): Map<number, SheetSnapshotForSave> {
    return this.eventAdapter.reset(sheets);
  }

  replaceSheetSnapshot(sheetId: number, snapshot: SheetSnapshotForSave): void {
    this.eventAdapter.replaceSheetSnapshot(sheetId, snapshot);
  }

  recordOperation(ops: readonly FortuneSheetOp[], activeSheetId: number): void {
    this.eventAdapter.handleOp(ops, activeSheetId);
  }

  handleChange(
    data: readonly {
      id: string | number;
      data: readonly (Readonly<Record<string, unknown>> | null)[][];
    }[],
    activeSheetId: number,
    loadedSheetIds: ReadonlySet<number>,
  ): FortuneSheetChangeResult[] {
    return this.eventAdapter.handleChange(data, activeSheetId, { loadedSheetIds });
  }
}
