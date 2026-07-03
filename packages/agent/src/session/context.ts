export interface WorkspaceSheetSummary {
  id: number;
  name: string;
}

export interface WorkspaceWorkbookSummary {
  id: number;
  name: string;
  sheets: WorkspaceSheetSummary[];
}

export function buildWorkspaceContext(workbooks: WorkspaceWorkbookSummary[]): string {
  if (workbooks.length === 0) {
    return "当前没有可用的工作簿。";
  }

  return workbooks
    .map(
      (workbook) =>
        `工作簿: ${workbook.name} (id: ${workbook.id})\n${workbook.sheets
          .map((sheet) => `  - Sheet: ${sheet.name} (id: ${sheet.id})`)
          .join("\n")}`,
    )
    .join("\n");
}
