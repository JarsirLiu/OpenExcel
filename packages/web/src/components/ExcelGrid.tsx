import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { Workbook } from "@fortune-sheet/react";
import "@fortune-sheet/react/dist/index.css";
import { matrixToCelldata } from "@openexcel/core";
import type { WorkbookFull } from "../api/client";
import { updateSheetData } from "../api/client";
import { toFortuneSheetData } from "../adapters/fortuneSheet";

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

  const getSnapshot = useCallback((celldata: any[]) => {
    // 保留 mc 等全部属性，不丢失合并信息
    return JSON.stringify(celldata);
  }, []);

  useEffect(() => {
    if (!workbook) return;

    const nextSnapshots: Record<number, string> = {};
    workbook.sheets.forEach((sheet) => {
      nextSnapshots[sheet.id] = getSnapshot(toFortuneSheetData(sheet).celldata);
    });

    lastSavedSnapshotRef.current = nextSnapshots;
  }, [workbook, getSnapshot]);

  const doSave = useCallback(async (celldata: any[]) => {
    if (!workbook || !workbook.sheets[currentSheetIndex]) return;

    setSaveStatus("saving");
    try {
      const sheet = workbook.sheets[currentSheetIndex];
      await updateSheetData(sheet.id, celldata);
      setSaveStatus("saved");
      onSheetDataChange?.(sheet.id, celldata);
      lastSavedSnapshotRef.current[sheet.id] = getSnapshot(celldata);
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      setSaveStatus("idle");
      console.error("保存失败:", err);
    }
  }, [workbook, currentSheetIndex, onSheetDataChange, getSnapshot]);

  const trySave = useCallback((celldata: any[]) => {
    if (!workbook || !workbook.sheets[currentSheetIndex]) return;
    const sheet = workbook.sheets[currentSheetIndex];
    if (!Array.isArray(celldata)) return;
    const snapshot = getSnapshot(celldata);
    if (lastSavedSnapshotRef.current[sheet.id] === snapshot) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      doSave(celldata);
    }, 500);
  }, [workbook, currentSheetIndex, doSave, getSnapshot]);

  /**
   * onChange: 每次 FortuneSheet 内部数据变更时触发。
   * data 是所有 sheet 的完整数据（SheetType[]），从中提取当前 sheet 的 celldata 进行保存。
   */
  const handleChange = useCallback((data: any[]) => {
    if (!workbook || !Array.isArray(data)) return;
    const sheet = workbook.sheets[currentSheetIndex];
    if (!sheet) return;
    const fortuneSheet = data.find((s: any) => String(s.id) === String(sheet.id));
    if (!fortuneSheet) return;
    // FortuneSheet 内部把 celldata 转成了 2D data 矩阵，需要转回 celldata 格式
    const cellMatrix = fortuneSheet.data;
    if (!Array.isArray(cellMatrix)) return;
    const celldata = matrixToCelldata(cellMatrix);
    trySave(celldata);
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

  if (!workbook) return null;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, position: "relative" }}>
      <Workbook
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
