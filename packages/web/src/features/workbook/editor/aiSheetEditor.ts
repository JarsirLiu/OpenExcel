import type { WorkbookInstance } from "@fortune-sheet/react";
import type { SheetChangeDelta, SheetChangeVersion } from "@openexcel/core";
import type { WorkbookFull } from "@/api/workbooks";
import type { SheetChangeSet } from "@/features/sync/sheetChangeSet";
import type { SheetSnapshotForSave } from "@/features/sync/sheetChunkSnapshot";
import { planFortuneSheetMutation } from "./fortuneSheetMutationBridge";

type AiSheetEditorOptions = {
  getWorkbook: () => WorkbookFull | null;
  getWorkbookInstance: () => WorkbookInstance | null;
  applyCommittedDocument: (
    change: {
      kind: "patch";
      sheetId: number;
      changeSet: SheetChangeSet;
    },
    revision: number,
  ) => void;
  replaceManualBaselineFromServer: (sheetId: number) => Promise<void>;
  replaceManualBaselineFromServerSnapshot: (
    sheetId: number,
    snapshot: SheetSnapshotForSave,
  ) => void;
  synchronizeSaveBaselineFromServerSnapshot: (
    sheetId: number,
    snapshot: SheetSnapshotForSave,
  ) => void;
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
      const workbook = this.options.getWorkbook();
      if (workbook?.sheets.some((sheet) => sheet.loaded === false))
        throw new Error("AI Sheet mutations require a fully loaded workbook");
      const sheet = workbook?.sheets.find((item) => item.id === sheetId);
      const instance = this.options.getWorkbookInstance();
      if (!workbook || !sheet || !instance)
        throw new Error("The active FortuneSheet editor is not ready");

      const plan = planFortuneSheetMutation(sheet, delta);
      if (
        plan.changeSet.valueChanges.length > 0 ||
        plan.changeSet.formulaCacheChanges.length > 0 ||
        plan.changeSet.formatChanges.length > 0 ||
        plan.changeSet.configChanges.length > 0
      ) {
        this.options.applyCommittedDocument(
          { kind: "patch", sheetId, changeSet: plan.changeSet },
          version.revision,
        );
      }
      if (
        plan.changeSet.valueChanges.length === 0 &&
        plan.changeSet.formulaCacheChanges.length === 0 &&
        plan.changeSet.formatChanges.length === 0 &&
        plan.changeSet.configChanges.length === 0
      ) {
        this.options.updateCommittedRevision(sheetId, version.revision);
        return;
      }

      // Seed both baselines with the server-confirmed content before the
      // browser recalculates formulas. Formula-cache changes emitted by that
      // calculation must enter the normal manual save path.
      this.options.replaceManualBaselineFromServerSnapshot(sheetId, plan.snapshot);
      this.options.synchronizeSaveBaselineFromServerSnapshot(sheetId, plan.snapshot);
      instance.batchCallApis(plan.apiCalls);
      await this.options.replaceManualBaselineFromServer(sheetId);
    };
    const queued = this.queue.then(run, run);
    this.queue = queued.catch((error) => {
      console.error("[sheet-sync][ai] mutation failed", { sheetId, error });
      return undefined;
    });
    return queued;
  }
}
