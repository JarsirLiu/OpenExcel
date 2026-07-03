import { useEffect, useState } from "react";
import { fetchWorkbookReferenceCandidates } from "../../../api/workbooks";

export type WorkbookSheetSummary = {
  workbookId: number;
  workbookName: string;
  id: number;
  name: string;
};

export function useWorkbookSheetSummaries() {
  const [allSheets, setAllSheets] = useState<WorkbookSheetSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetchWorkbookReferenceCandidates().then((workbooks) => {
      if (cancelled) return;
      setAllSheets(
        workbooks.flatMap((wb) =>
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
  }, []);

  return allSheets;
}
