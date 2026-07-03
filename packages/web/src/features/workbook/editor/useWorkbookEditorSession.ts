import { useMemo } from "react";
import { toFortuneSheetData, type FortuneSheetData } from "../../../adapters/fortuneSheet";
import type { WorkbookFull } from "../../../api/client";

type WorkbookEditorSession = {
  sheetData: FortuneSheetData[];
  sessionKey: number;
};

function cloneForEditor<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

export function useWorkbookEditorSession(
  workbook: WorkbookFull | null,
  revision: number,
): WorkbookEditorSession {
  const sheetData = useMemo(() => {
    if (!workbook) return [];
    return workbook.sheets.map((sheet) => cloneForEditor(toFortuneSheetData(sheet)));
  }, [workbook, revision]);

  return {
    sheetData,
    sessionKey: revision,
  };
}
