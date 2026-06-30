import { useRef, useState } from "react";
import { useWorkbench } from "../hooks/useWorkbench";
import { ExcelGrid } from "./ExcelGrid";
import { ChatInterface } from "./ChatInterface";
import { createSheet, deleteSheet } from "../api/client";

export function Workbench() {
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    workbooks, workbookIdx, switchWorkbook,
    currentWorkbook, uploadExcel,
    downloadTemplate, status, loading, refreshWorkbook,
  } = useWorkbench();

  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);

  const handleCreateSheet = async () => {
    if (!currentWorkbook) return;
    const created = await createSheet(currentWorkbook.id, currentWorkbook.sheets[currentSheetIndex]?.id);
    const refreshed = await refreshWorkbook();
    if (refreshed) {
      const nextIndex = refreshed.sheets.findIndex((sheet) => sheet.id === created.id);
      setCurrentSheetIndex(nextIndex >= 0 ? nextIndex : refreshed.sheets.length - 1);
    }
  };

  const handleDeleteSheet = async () => {
    if (!currentWorkbook) return;
    const currentSheet = currentWorkbook.sheets[currentSheetIndex];
    if (!currentSheet) return;
    await deleteSheet(currentSheet.id);
    const nextIndex = Math.max(0, currentSheetIndex - 1);
    const refreshed = await refreshWorkbook();
    if (refreshed) {
      setCurrentSheetIndex(Math.min(nextIndex, refreshed.sheets.length - 1));
    }
  };

  const handleSwitchWorkbook = async (index: number) => {
    await switchWorkbook(index);
    setCurrentSheetIndex(0);
  };

  if (loading) {
    return <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>加载中...</div>;
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px 0", background: "linear-gradient(180deg, #f6f7fb 0%, #eceff5 100%)", borderBottom: "1px solid #cfd6e4" }}>
        <div style={{ display: "flex", gap: 6, flex: 1, alignItems: "stretch", overflowX: "auto", paddingBottom: 6 }}>
          {workbooks.map((wb, i) => (
            <div
              key={wb.id}
              onClick={() => handleSwitchWorkbook(i)}
              style={{
                padding: "8px 14px",
                cursor: "pointer",
                border: "1px solid",
                borderColor: i === workbookIdx ? "#c6d4ea #c6d4ea #fff" : "#d8dee9 #d8dee9 #c7cedb",
                borderBottom: i === workbookIdx ? "1px solid #fff" : "1px solid #c7cedb",
                borderRadius: "8px 8px 0 0",
                background: i === workbookIdx ? "#fff" : "linear-gradient(180deg, #f4f6f9 0%, #e4e9f1 100%)",
                boxShadow: i === workbookIdx ? "0 -1px 0 #fff inset" : "none",
                fontWeight: i === workbookIdx ? 600 : 500,
                color: i === workbookIdx ? "#1f2a37" : "#5b6473",
                fontSize: 13,
                whiteSpace: "nowrap",
              }}
            >
              {wb.name}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, paddingBottom: 6 }}>
          <button onClick={downloadTemplate} style={{ fontSize: 12 }}>下载模板</button>
          <button onClick={() => inputRef.current?.click()} style={{ fontSize: 12 }}>上传 Excel</button>
          <button onClick={handleCreateSheet} style={{ fontSize: 12 }}>新建 Sheet</button>
          <button onClick={handleDeleteSheet} style={{ fontSize: 12 }}>删除当前 Sheet</button>
        </div>
        {status && <span style={{ fontSize: 12, color: status.includes("失败") ? "#d32f2f" : "#2e7d32" }}>{status}</span>}
      </div>

      <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadExcel(f); e.target.value = ""; }} />

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <ExcelGrid 
            workbook={currentWorkbook} 
            currentSheetIndex={currentSheetIndex}
            onSheetIndexChange={setCurrentSheetIndex}
          />
        </div>
        {currentWorkbook?.sheets[currentSheetIndex]?.id && (
          <ChatInterface 
            key={currentWorkbook.sheets[currentSheetIndex].id}
            sheets={currentWorkbook.sheets}
            currentSheetId={currentWorkbook.sheets[currentSheetIndex].id}
          />
        )}
      </div>
    </div>
  );
}
