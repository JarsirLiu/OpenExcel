import { Workbook } from "@fortune-sheet/react";
import "@fortune-sheet/react/dist/index.css";
import type { WorkbookFull } from "../../api/client";
import { useExcelGridWorkspace } from "./useExcelGridWorkspace";

interface Props {
  workbook: WorkbookFull | null;
  workbookRevision: number;
  currentSheetIndex: number;
  onSheetIndexChange?: (sheetIndex: number) => void;
  onWorkbookDelete?: (workbookId: number) => void;
}

export function ExcelGrid({
  workbook,
  workbookRevision,
  currentSheetIndex,
  onSheetIndexChange,
  onWorkbookDelete,
}: Props) {
  const {
    saveStatus,
    workbookRef,
    sheetData,
    sessionKey,
    handleChange,
    handleActivateSheet,
    handleDownload,
    handleDeleteWorkbook,
  } = useExcelGridWorkspace({
    workbook,
    workbookRevision,
    currentSheetIndex,
    onSheetIndexChange,
    onWorkbookDelete,
  });

  if (!workbook) return null;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", background: "#f5f5f5", borderBottom: "1px solid #e0e4ea" }}>
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{workbook.name}</span>
        <button
          onClick={handleDownload}
          style={{
            fontSize: 12,
            padding: "2px 10px",
            cursor: "pointer",
            border: "1px solid #ccc",
            borderRadius: 4,
            background: "#fff",
          }}
        >
          下载 Excel
        </button>
        <button
          onClick={() => void handleDeleteWorkbook()}
          style={{
            fontSize: 12,
            padding: "2px 10px",
            cursor: "pointer",
            border: "1px solid #ccc",
            borderRadius: 4,
            background: "#fff",
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
          key={`${workbook.id}:${sessionKey}`}
          ref={workbookRef}
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
