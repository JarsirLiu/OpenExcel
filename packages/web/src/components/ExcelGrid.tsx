import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { Workbook } from "@fortune-sheet/react";
import "@fortune-sheet/react/dist/index.css";
import { celldataToGrid, isCelldata } from "@openexcel/core";
import type { WorkbookFull } from "../api/client";
import { updateSheetData } from "../api/client";
import { toFortuneSheetData } from "../adapters/fortuneSheet";
import type { FortuneCell } from "../adapters/fortuneSheet";
import type { WorkbookInstance } from "@fortune-sheet/react";

interface Props {
  workbook: WorkbookFull | null;
  currentSheetIndex: number;
  onSheetIndexChange?: (sheetIndex: number) => void;
  onSheetDataChange?: (sheetId: number, celldata: any[]) => void;
}

export function ExcelGrid({ workbook, currentSheetIndex, onSheetIndexChange, onSheetDataChange }: Props) {
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSnapshotRef = useRef<Record<number, string>>({});
  const workbookRef = useRef<WorkbookInstance>(null);

  const getSheetSnapshot = useCallback((celldata: any[], colCount: number) => {
    const grid = celldataToGrid(celldata, colCount);
    return JSON.stringify(grid);
  }, []);

  useEffect(() => {
    if (!workbook) return;

    const nextSnapshots: Record<number, string> = {};
    workbook.sheets.forEach((sheet) => {
      nextSnapshots[sheet.id] = getSheetSnapshot(toFortuneSheetData(sheet).celldata, sheet.columns.length);
    });

    lastSavedSnapshotRef.current = nextSnapshots;
  }, [workbook, getSheetSnapshot]);

  const doSave = useCallback(async (celldata: any[]) => {
    if (!workbook || !workbook.sheets[currentSheetIndex]) return;

    setSaveStatus("saving");
    try {
      const sheet = workbook.sheets[currentSheetIndex];
      await updateSheetData(sheet.id, celldata);
      setSaveStatus("saved");
      onSheetDataChange?.(sheet.id, celldata);
      lastSavedSnapshotRef.current[sheet.id] = getSheetSnapshot(celldata, sheet.columns.length);
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      setSaveStatus("idle");
      console.error("保存失败:", err);
    }
  }, [workbook, currentSheetIndex, onSheetDataChange, getSheetSnapshot]);

  /**
   * 从当前 FortuneSheet 实例获取该 sheet 的 celldata 并保存。
   */
  const saveCurrentSheet = useCallback(() => {
    const inst = workbookRef.current;
    if (!inst || !workbook) return;
    const allSheets = inst.getAllSheets();
    const sheet = workbook.sheets[currentSheetIndex];
    if (!sheet) return;
    const fortuneSheet = allSheets.find((s: any) => s.id === String(sheet.id));
    if (!fortuneSheet) return;
    // fortuneSheet.celldata 是当前 sheet 的 cell 数据（包含 mc 等属性）
    const celldata = fortuneSheet.celldata as FortuneCell[];
    if (!Array.isArray(celldata)) return;
    const snapshot = getSheetSnapshot(celldata, sheet.columns.length);
    if (lastSavedSnapshotRef.current[sheet.id] === snapshot) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      doSave(celldata);
    }, 500);
  }, [workbook, currentSheetIndex, doSave, getSheetSnapshot]);

  /**
   * onChange: 当 FortuneSheet 内部数据变更时触发。
   * data 是所有 sheet 的完整数据（SheetType[]）。
   * 主要用来更新我们的快照引用。
   */
  const handleChange = useCallback((_data: any) => {
    // 不做立即保存，由 onOp 驱动保存
  }, []);

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

  /**
   * onOp: 监听所有操作（编辑、合并、插入/删除行列等），触发保存。
   */
  const handleOp = useCallback((_ops: any[]) => {
    // 任何操作后都检查并保存
    saveCurrentSheet();
  }, [saveCurrentSheet]);

  if (!workbook) return null;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, position: "relative" }}>
      <Workbook
        ref={workbookRef}
        key={workbook.name}
        data={sheetData as any}
        onChange={handleChange}
        onOp={handleOp}
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
