import { useEffect, useState } from "react";
import { fetchWorkbook } from "../../api/client";

type WorkbookMeta = {
  id: number;
  name: string;
};

export type WorkbookSheetSummary = {
  workbookId: number;
  workbookName: string;
  id: number;
  name: string;
};

export function useWorkbookSheetSummaries(workbooks: WorkbookMeta[]) {
  const [allSheets, setAllSheets] = useState<WorkbookSheetSummary[]>([]);

  useEffect(() => {
    if (workbooks.length === 0) {
      setAllSheets([]);
      return;
    }

    let cancelled = false;
    Promise.all(workbooks.map((wb) => fetchWorkbook(wb.id))).then((fullList) => {
      if (cancelled) return;
      setAllSheets(
        fullList.flatMap((wb) =>
          wb.sheets.map((sheet) => ({
            workbookId: wb.id,
            workbookName: wb.name,
            id: sheet.id,
            name: sheet.name,
          })),
        ),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [workbooks]);

  return allSheets;
}
