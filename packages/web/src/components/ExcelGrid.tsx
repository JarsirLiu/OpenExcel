import { useMemo } from "react";
import { Workbook } from "@fortune-sheet/react";
import "@fortune-sheet/react/dist/index.css";
import type { WorkbookFull } from "../api/client";

interface Props {
  workbook: WorkbookFull | null;
}

function buildCelldata(
  columns: { label: string; width?: number }[],
  templateRows: string[][],
  uploadedData?: string[][] | null,
) {
  const cells: { r: number; c: number; v: { v: any; m: string } }[] = [];

  columns.forEach((col, ci) => {
    cells.push({ r: 0, c: ci, v: { v: col.label, m: col.label } });
  });

  const rows = uploadedData ?? templateRows;

  rows.forEach((row, ri) => {
    const r = ri + 1;
    columns.forEach((_col, ci) => {
      const val = row[ci] ?? "";
      cells.push({ r, c: ci, v: { v: val, m: String(val) } });
    });
  });

  return cells;
}

export function ExcelGrid({ workbook }: Props) {
  const sheetData = useMemo(() => {
    if (!workbook) return [];
    return workbook.sheets.map((sheet) => ({
      name: sheet.name,
      celldata: buildCelldata(sheet.columns, sheet.rows, sheet.uploadedData),
      columnWidths: sheet.columns.reduce((acc: any, col, i) => {
        if (col.width) acc[i] = col.width;
        return acc;
      }, {}),
      merges: (sheet.merges || []).map((m) => ({
        row: [m.row[0] + 1, m.row[1] + 1],
        col: [m.col[0], m.col[1]],
      })),
    }));
  }, [workbook]);

  if (!workbook) return null;

  return (
    <div style={{ flex: 1 }}>
      <Workbook
        key={workbook.name}
        data={sheetData as any}
        onChange={() => {}}
        showSheetTabs={true}
        showToolbar={false}
        showFormulaBar={false}
        allowUpdate={true}
      />
    </div>
  );
}
