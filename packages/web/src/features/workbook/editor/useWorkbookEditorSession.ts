import { useMemo } from "react";
import type { WorkbookFull } from "@/api/workbooks";
import { type FortuneSheetData, toFortuneSheetData } from "./fortuneSheet";

type WorkbookEditorSession = {
  sheetData: FortuneSheetData[];
  sessionKey: string;
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
  const sheetLoadKey =
    workbook?.sheets
      .map((sheet) => `${sheet.id}:${sheet.loaded === false ? "unloaded" : "loaded"}`)
      .join(",") ?? "none";
  const sheetData = useMemo(() => {
    if (!workbook) return [];
    return workbook.sheets.map((sheet) => cloneForEditor(toFortuneSheetData(sheet)));
  }, [sheetLoadKey, workbook?.id, revision]);

  return {
    sheetData,
    sessionKey: `${revision}:${sheetLoadKey}`,
  };
}
