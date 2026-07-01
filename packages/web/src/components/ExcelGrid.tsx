import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { Workbook } from "@fortune-sheet/react";
import "@fortune-sheet/react/dist/index.css";
import * as XLSX from "xlsx";
import { matrixToCelldata, extractSheetConfig } from "@openexcel/core";
import type { WorkbookFull } from "../api/client";
import { updateSheetData, deleteWorkbook } from "../api/client";
import { confirm } from "./ConfirmDialog";
import { toFortuneSheetData } from "../adapters/fortuneSheet";
import type { WorkbookInstance } from "@fortune-sheet/react";

interface Props {
  workbook: WorkbookFull | null;
  currentSheetIndex: number;
  onSheetIndexChange?: (sheetIndex: number) => void;
  onSheetDataChange?: (sheetId: number, celldata: any[]) => void;
  onWorkbookDelete?: (workbookId: number) => void;
}

export function ExcelGrid({ workbook, currentSheetIndex, onSheetIndexChange, onSheetDataChange, onWorkbookDelete }: Props) {
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef<Record<number, string>>({});
  const workbookRef = useRef<WorkbookInstance>(null);

  const getSnapshot = useCallback((celldata: any[], config: any) => {
    return JSON.stringify({ celldata, config });
  }, []);

  useEffect(() => {
    if (!workbook) return;

    const nextSnapshots: Record<number, string> = {};
    workbook.sheets.forEach((sheet) => {
      const fd = toFortuneSheetData(sheet);
      nextSnapshots[sheet.id] = getSnapshot(fd.celldata, extractSheetConfig(fd));
    });

    lastSavedSnapshotRef.current = nextSnapshots;
  }, [workbook, getSnapshot]);

  const doSave = useCallback(async (celldata: any[], config: any) => {
    if (!workbook || !workbook.sheets[currentSheetIndex]) return;

    setSaveStatus("saving");
    try {
      const sheet = workbook.sheets[currentSheetIndex];
      await updateSheetData(sheet.id, celldata, config);
      setSaveStatus("saved");
      onSheetDataChange?.(sheet.id, celldata);
      lastSavedSnapshotRef.current[sheet.id] = getSnapshot(celldata, config);
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      setSaveStatus("idle");
      console.error("保存失败:", err);
    }
  }, [workbook, currentSheetIndex, onSheetDataChange, getSnapshot]);

  const trySave = useCallback((celldata: any[], config: any) => {
    if (!workbook || !workbook.sheets[currentSheetIndex]) return;
    const sheet = workbook.sheets[currentSheetIndex];
    if (!Array.isArray(celldata)) return;
    const snapshot = getSnapshot(celldata, config);
    if (lastSavedSnapshotRef.current[sheet.id] === snapshot) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      doSave(celldata, config);
    }, 500);
  }, [workbook, currentSheetIndex, doSave, getSnapshot]);

  const handleChange = useCallback((data: any[]) => {
    if (!workbook || !Array.isArray(data)) return;
    const sheet = workbook.sheets[currentSheetIndex];
    if (!sheet) return;
    const fortuneSheet = data.find((s: any) => String(s.id) === String(sheet.id));
    if (!fortuneSheet) return;

    const cellMatrix = fortuneSheet.data;
    if (!Array.isArray(cellMatrix)) return;
    const celldata = matrixToCelldata(cellMatrix);
    const config = extractSheetConfig(fortuneSheet);
    trySave(celldata, config);
  }, [workbook, currentSheetIndex, trySave]);

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

  const handleDownload = useCallback(() => {
    const inst = workbookRef.current;
    if (!inst) return;
    const allSheets = inst.getAllSheets();
    if (!allSheets || allSheets.length === 0) return;

    const wb = XLSX.utils.book_new();
    for (const s of allSheets as any[]) {
      const data = s.data;
      if (!data || !Array.isArray(data)) continue;
      const rows: any[][] = data.map((row: any[]) =>
        row.map((cell: any) => (cell != null ? (cell.m !== undefined ? cell.m : cell.v) : "")),
      );
      const ws = XLSX.utils.aoa_to_sheet(rows);

      if (s.config?.columnlen) {
        ws["!cols"] = Object.entries(s.config.columnlen as Record<string, number>).map(
          ([, w]) => ({ wch: Math.round(w / 7) || 10 }),
        );
      }

      const mergeRows = s.config?.merge;
      if (mergeRows) {
        ws["!merges"] = Object.values(mergeRows as Record<string, { r: number; c: number; rs: number; cs: number }>).map(
          (m) => ({ s: { r: m.r, c: m.c }, e: { r: m.r + m.rs - 1, c: m.c + m.cs - 1 } }),
        );
      }

      XLSX.utils.book_append_sheet(wb, ws, s.name);
    }

    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([buf], { type: "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${workbook?.name ?? "export"}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [workbook]);

  const handleDeleteWorkbook = useCallback(async () => {
    if (!workbook) return;
    const ok = await confirm({
      title: "删除 Excel",
      message: `确认删除「${workbook.name}」？此操作不可恢复。`,
      confirmText: "删除",
      cancelText: "取消",
    });
    if (!ok) return;
    await deleteWorkbook(workbook.id);
    onWorkbookDelete?.(workbook.id);
  }, [workbook, onWorkbookDelete]);

  if (!workbook) return null;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", background: "#f5f5f5", borderBottom: "1px solid #e0e4ea" }}>
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{workbook.name}</span>
        <button
          onClick={handleDownload}
          style={{
            fontSize: 12, padding: "2px 10px", cursor: "pointer",
            border: "1px solid #ccc", borderRadius: 4, background: "#fff",
          }}
        >
          下载 Excel
        </button>
        <button
          onClick={handleDeleteWorkbook}
          style={{
            fontSize: 12, padding: "2px 10px", cursor: "pointer",
            border: "1px solid #ccc", borderRadius: 4, background: "#fff",
            color: "#d32f2f",
          }}
        >
          删除 Excel
        </button>
        {saveStatus === "saving" && <span style={{ fontSize: 12, color: "#f0ad4e" }}>保存中...</span>}
        {saveStatus === "saved" && <span style={{ fontSize: 12, color: "#5cb85c" }}>已保存</span>}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Workbook
          ref={workbookRef}
          key={workbook.name}
          data={sheetData as any}
          onChange={handleChange}
          showSheetTabs={true}
          showToolbar={true}
          showFormulaBar={false}
          toolbarItems={[
            "merge-cell", "|",
            "bold", "italic", "strike-through", "underline", "|",
            "font-color", "background", "border", "|",
            "horizontal-align", "vertical-align", "text-wrap", "|",
            "clear", "filter", "link", "comment",
          ]}
          cellContextMenu={[
            "copy", "paste", "|",
            "insert-row", "insert-column",
            "delete-row", "delete-column", "delete-cell", "|",
            "clear", "sort", "orderAZ", "orderZA", "filter", "|",
            "data", "cell-format",
          ]}
          // @ts-expect-error allowUpdate is a valid prop but missing from types
          allowUpdate={true}
          hooks={{
            afterActivateSheet: handleActivateSheet,
          }}
        />
      </div>
    </div>
  );
}