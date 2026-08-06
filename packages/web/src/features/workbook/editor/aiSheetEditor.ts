import type { WorkbookInstance } from "@fortune-sheet/react";
import {
  extractSheetConfig,
  type SheetChangeDelta,
  type SheetChangeVersion,
} from "@openexcel/core";
import type { WorkbookFull } from "@/api/workbooks";
import type { SheetSnapshotForSave } from "@/features/sync/sheetChunkSnapshot";
import { toFortuneSheetData } from "./fortuneSheet";
import { planFortuneSheetMutation } from "./fortuneSheetMutationBridge";

type AiSheetEditorOptions = {
  getWorkbook: () => WorkbookFull | null;
  getWorkbookInstance: () => WorkbookInstance | null;
  ensureAllSheetsLoaded?: () => Promise<WorkbookFull | null>;
  applyCommittedDocument: (
    change: {
      kind: "patch";
      sheetId: number;
      mutation: Extract<SheetChangeDelta, { type: "patch" }>;
    },
    revision: number,
  ) => void;
  advanceManualBaseline: (sheetId: number, snapshot: SheetSnapshotForSave) => void;
  setSnapshot: (sheetId: number, snapshot: SheetSnapshotForSave) => void;
  updateCommittedRevision: (sheetId: number, revision: number) => void;
};

export class AiSheetEditor {
  private queue = Promise.resolve();

  constructor(private readonly options: AiSheetEditorOptions) {}

  applyCommittedMutation(
    sheetId: number,
    delta: SheetChangeDelta,
    version: SheetChangeVersion,
  ): Promise<void> {
    const run = async () => {
      const initialWorkbook = this.options.getWorkbook();
      const unloadedSheetIds = new Set(
        initialWorkbook?.sheets
          .filter((sheet) => sheet.loaded === false)
          .map((sheet) => sheet.id) ?? [],
      );
      const loadedWorkbook = await this.options.ensureAllSheetsLoaded?.();
      const workbook = loadedWorkbook ?? this.options.getWorkbook();
      if (initialWorkbook?.id !== workbook?.id)
        throw new Error("The workbook changed while loading sheets for the AI mutation");
      if (workbook?.sheets.some((sheet) => sheet.loaded === false))
        throw new Error("All workbook sheets must be loaded before applying an AI mutation");
      const sheet = workbook?.sheets.find((item) => item.id === sheetId);
      const instance = this.options.getWorkbookInstance();
      if (!workbook || !sheet || !instance)
        throw new Error("The active FortuneSheet editor is not ready");

      if (loadedWorkbook && unloadedSheetIds.size > 0) {
        const newlyLoadedData = loadedWorkbook.sheets
          .filter((item) => unloadedSheetIds.has(item.id))
          .map(toFortuneSheetData);
        for (const loadedSheet of newlyLoadedData) {
          const snapshot = {
            celldata: loadedSheet.celldata,
            config: extractSheetConfig(loadedSheet),
          };
          this.options.advanceManualBaseline(Number(loadedSheet.id), snapshot);
          this.options.setSnapshot(Number(loadedSheet.id), snapshot);
        }
        if (newlyLoadedData.length > 0)
          instance.updateSheet(
            newlyLoadedData as unknown as Parameters<typeof instance.updateSheet>[0],
          );
      }

      const plan = planFortuneSheetMutation(sheet, delta);
      if (plan.patch) {
        this.options.applyCommittedDocument(
          { kind: "patch", sheetId, mutation: plan.patch },
          version.revision,
        );
      }
      this.options.advanceManualBaseline(sheetId, plan.snapshot);
      this.options.setSnapshot(sheetId, plan.snapshot);
      if (!plan.patch) {
        this.options.updateCommittedRevision(sheetId, version.revision);
        return;
      }

      instance.batchCallApis(plan.apiCalls);
    };
    const queued = this.queue.then(run, run);
    this.queue = queued.catch(() => undefined);
    return queued;
  }
}
