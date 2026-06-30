import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { Workbook } from "@fortune-sheet/react";
import "@fortune-sheet/react/dist/index.css";
import type { WorkbookFull } from "../api/client";
import { updateSheetData } from "../api/client";
import { buildCelldata, celldataTo2DArray, toFortuneSheetData } from "../adapters/fortuneSheet";

interface Props {
  workbook: WorkbookFull | null;
  currentSheetIndex: number;
  onSheetIndexChange?: (sheetIndex: number) => void;
  onSheetDataChange?: (sheetId: number, celldata: any[][]) => void;
}

export function ExcelGrid({ workbook, currentSheetIndex, onSheetIndexChange, onSheetDataChange }: Props) {
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [pendingData, setPendingData] = useState<any[][] | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef<Record<number, string>>({});
  const editTriggeredRef = useRef(false);

  const getSheetSnapshot = useCallback((celldata: any[][]) => JSON.stringify(celldata ?? []), []);

  useEffect(() => {
    if (!workbook) return;

    const nextSnapshots: Record<number, string> = {};
    workbook.sheets.forEach((sheet) => {
      const currentData = buildCelldata(sheet.columns, sheet.rows, sheet.uploadedData);
      const currentArray = celldataTo2DArray(currentData, sheet.columns.length);
      nextSnapshots[sheet.id] = getSheetSnapshot(currentArray);
    });

    lastSavedSnapshotRef.current = nextSnapshots;
  }, [workbook, getSheetSnapshot]);

  const handleSave = useCallback(async (celldata: any[][]) => {
    if (!workbook || !workbook.sheets[currentSheetIndex]) return;
    
    setSaveStatus("saving");
    try {
      const sheet = workbook.sheets[currentSheetIndex];
      await updateSheetData(sheet.id, celldata);
      setSaveStatus("saved");
      onSheetDataChange?.(sheet.id, celldata);
      lastSavedSnapshotRef.current[sheet.id] = getSheetSnapshot(celldata);
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      setSaveStatus("idle");
      console.error("保存失败:", err);
    }
  }, [workbook, currentSheetIndex, onSheetDataChange]);

  const handleChange = useCallback((data: any) => {
    if (!data || !Array.isArray(data)) return;

    if (!editTriggeredRef.current) {
      return;
    }
    editTriggeredRef.current = false;
    
    const currentSheet = workbook?.sheets[currentSheetIndex];
    if (!currentSheet) return;

    const celldata2D = celldataTo2DArray(data, currentSheet.columns.length);
    const snapshot = getSheetSnapshot(celldata2D);

    if (lastSavedSnapshotRef.current[currentSheet.id] === snapshot) {
      return;
    }

    setPendingData(celldata2D);

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      handleSave(celldata2D);
    }, 1000);
  }, [workbook, currentSheetIndex, handleSave, getSheetSnapshot]);

  const sheetData = useMemo(() => {
    if (!workbook) return [];
    return workbook.sheets.map((sheet) => toFortuneSheetData(sheet));
  }, [workbook]);

  const handleActivateSheet = useCallback((sheetId: string) => {
    if (!workbook) return;
    const nextIndex = workbook.sheets.findIndex((sheet) => String(sheet.id) === sheetId);
    if (nextIndex >= 0) {
      onSheetIndexChange?.(nextIndex);
    }
  }, [workbook, onSheetIndexChange]);

  const handleAfterUpdateCell = useCallback(() => {
    editTriggeredRef.current = true;
  }, []);

  if (!workbook) return null;

  return (
    <div style={{ flex: 1, position: "relative" }}>
      <Workbook
        key={workbook.name}
        data={sheetData as any}
        onChange={handleChange}
        showSheetTabs={true}
        showToolbar={false}
        showFormulaBar={false}
        // @ts-expect-error allowUpdate is a valid prop but missing from types
        allowUpdate={true}
        hooks={{
          afterActivateSheet: handleActivateSheet,
          afterUpdateCell: handleAfterUpdateCell,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          padding: "4px 8px",
          borderRadius: 4,
          fontSize: 12,
          backgroundColor:
            saveStatus === "saving"
              ? "#f0ad4e"
              : saveStatus === "saved"
              ? "#5cb85c"
              : "rgba(0,0,0,0.6)",
          color: "#fff",
          pointerEvents: "none",
        }}
      >
        {saveStatus === "saving"
          ? "保存中..."
          : saveStatus === "saved"
          ? "已保存"
          : ""}
      </div>
    </div>
  );
}
