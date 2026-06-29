import { useRef, useState, useCallback, useEffect } from "react";
import { useWorkbench } from "../hooks/useWorkbench";
import { ExcelGrid } from "./ExcelGrid";
import { Sidebar } from "./Sidebar";

const workbookTabStyle = (active: boolean): React.CSSProperties => ({
  padding: "6px 20px",
  cursor: "pointer",
  borderRight: "1px solid #c0c0c0",
  background: active ? "#fff" : "#e8e8e8",
  fontWeight: active ? 600 : 400,
  borderTop: active ? "2px solid #1a73e8" : "2px solid transparent",
  marginTop: active ? -2 : 0,
  fontSize: 13,
  userSelect: "none",
});

interface FileRecord {
  name: string;
  size: number;
  status: "parsing" | "done" | "error";
  message?: string;
}

export function Workbench() {
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    workbooks, workbookIdx, switchWorkbook,
    currentWorkbook, uploadExcel,
    downloadTemplate, status, clearData, loading,
  } = useWorkbench();

  const [fileList, setFileList] = useState<FileRecord[]>([]);

  useEffect(() => {
    setFileList([]);
  }, [workbookIdx]);

  const handleUpload = useCallback(async (file: File) => {
    setFileList((prev) => [...prev, { name: file.name, size: file.size, status: "parsing" }]);
    try {
      await uploadExcel(file);
      setFileList((prev) => prev.map((f) => f.name === file.name ? { ...f, status: "done" } : f));
    } catch (err: any) {
      setFileList((prev) => prev.map((f) => f.name === file.name ? { ...f, status: "error", message: err.message } : f));
    }
  }, [uploadExcel]);

  const handleClear = useCallback(() => {
    setFileList([]);
    clearData();
  }, [clearData]);

  if (loading) {
    return <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>加载中...</div>;
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", background: "#f0f0f0", borderBottom: "2px solid #1a73e8", alignItems: "flex-end" }}>
        {workbooks.map((wb, i) => (
          <div key={wb.id} style={workbookTabStyle(i === workbookIdx)} onClick={() => switchWorkbook(i)}>
            {wb.name}
          </div>
        ))}
        <div style={{ marginLeft: "auto", padding: "4px 12px", display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={downloadTemplate} style={{ fontSize: 12 }}>下载模板</button>
          <button onClick={() => inputRef.current?.click()} style={{ fontSize: 12 }}>上传 Excel</button>
          {status && <span style={{ fontSize: 12, color: status.includes("失败") ? "#d32f2f" : "#2e7d32" }}>{status}</span>}
        </div>
      </div>

      <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <ExcelGrid workbook={currentWorkbook} />
        </div>
        <Sidebar fileList={fileList} onUpload={handleUpload} onClearData={handleClear} />
      </div>
    </div>
  );
}
