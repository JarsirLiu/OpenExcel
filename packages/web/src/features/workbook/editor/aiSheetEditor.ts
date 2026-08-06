import type { WorkbookInstance } from "@fortune-sheet/react";
import type { SheetChangeDelta, SheetChangeVersion } from "@openexcel/core";
import type { WorkbookFull } from "@/api/workbooks";
import type { SheetSnapshotForSave } from "@/features/sync/sheetChunkSnapshot";
import { planFortuneSheetMutation } from "./fortuneSheetMutationBridge";

type AiSheetEditorOptions = {
  getWorkbook: () => WorkbookFull | null;
  getWorkbookInstance: () => WorkbookInstance | null;
  applyCommittedDocument: (
    change: {
      kind: "patch";
      sheetId: number;
      mutation: Extract<SheetChangeDelta, { type: "patch" }>;
    },
    revision: number,
  ) => void;
  setManualEventsSuppressed: (suppressed: boolean) => void;
  replaceManualBaselineFromServer: (sheetId: number) => Promise<void>;
  replaceManualBaselineFromServerSnapshot: (
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
      if (plan.patch) {
        this.options.applyCommittedDocument(
          { kind: "patch", sheetId, mutation: plan.patch },
          version.revision,
        );
      }
      if (!plan.patch) {
        this.options.updateCommittedRevision(sheetId, version.revision);
        return;
      }

      this.options.setManualEventsSuppressed(true);
      try {
        instance.batchCallApis(plan.apiCalls);
      } finally {
        this.options.setManualEventsSuppressed(false);
      }
      await this.options.replaceManualBaselineFromServer(sheetId);
    };
    const queued = this.queue.then(run, run);
    this.queue = queued.catch(() => undefined);
    return queued;
  }
}
