import type { DemoStep, DemoWorkbook } from "./replayTypes";

export type DemoWorkbookReplayState = {
  visible: DemoWorkbook[];
  staged: DemoWorkbook[] | null;
  hasChanges: boolean;
};

function hasStepPatch(step: DemoStep): boolean {
  if (!step.patch) return false;
  return Array.isArray(step.patch) ? step.patch.length > 0 : step.patch.values.length > 0;
}

function applyStepPatch(workbooks: DemoWorkbook[], step: DemoStep): DemoWorkbook[] {
  if (!step.patch) return workbooks;
  const patches = Array.isArray(step.patch) ? step.patch : [step.patch];

  return workbooks.map((workbook) => {
    const workbookPatches = patches.filter(
      (patch) => patch.workbook == null || patch.workbook === workbook.name,
    );
    if (workbookPatches.length === 0) return workbook;

    return {
      ...workbook,
      sheets: workbook.sheets.map((sheet) => {
        const sheetPatches = workbookPatches.filter((patch) => patch.sheet === sheet.name);
        if (sheetPatches.length === 0) return sheet;

        const rows = sheet.rows.map((row) => [...row]);
        for (const patch of sheetPatches) {
          const row = rows[patch.row - 1];
          if (!row) continue;
          patch.values.forEach((value, index) => {
            row[patch.startCol - 1 + index] = { ...value };
          });
        }
        return { ...sheet, rows };
      }),
    };
  });
}

export function stageDemoWorkbookStep(
  state: DemoWorkbookReplayState,
  step: DemoStep,
): DemoWorkbookReplayState {
  if (!hasStepPatch(step)) return state;

  return {
    ...state,
    staged: applyStepPatch(state.staged ?? state.visible, step),
    hasChanges: true,
  };
}

export function commitDemoWorkbook(state: DemoWorkbookReplayState): DemoWorkbookReplayState {
  if (!state.staged || !state.hasChanges) return state;

  return {
    visible: state.staged,
    staged: null,
    hasChanges: false,
  };
}
