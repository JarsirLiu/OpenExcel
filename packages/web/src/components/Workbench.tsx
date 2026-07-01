import { useRef, useState, useCallback, useEffect } from "react";
import { useWorkbench } from "../hooks/useWorkbench";
import { uploadNewWorkbook, deleteWorkbook, fetchWorkbooks, fetchWorkbook } from "../api/client";
import { WorkbenchHeader } from "./WorkbenchHeader";
import { ExcelWorkspace } from "./ExcelWorkspace";
import { ChatSidebar } from "./ChatSidebar";

export function Workbench() {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const newWbInputRef = useRef<HTMLInputElement>(null);
  const {
    workbooks,
    workbookIdx,
    switchWorkbook,
    currentWorkbook,
    uploadExcel,
    status,
    loading,
    setWorkbooks,
    setCurrentWorkbook,
    setWorkbookIdx,
    setStatus,
  } = useWorkbench();

  const [currentSheetIndex, setCurrentSheetIndex] = useState(0);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!currentWorkbook) return;
      const hasSheet = currentWorkbook.sheets.some((s) => s.id === detail.sheetId);
      if (!hasSheet) return;
      try {
        const full = await fetchWorkbook(currentWorkbook.id);
        setCurrentWorkbook(full);
        setRevision((r) => r + 1);
      } catch {
        // ignore
      }
    };
    window.addEventListener("openexcel:sheet-changed", handler);
    return () => window.removeEventListener("openexcel:sheet-changed", handler);
  }, [currentWorkbook, setCurrentWorkbook]);

  const handleSwitchWorkbook = useCallback(async (index: number) => {
    await switchWorkbook(index);
    setCurrentSheetIndex(0);
    setRevision(0);
  }, [switchWorkbook]);

  const handleUploadFileChange = useCallback(async (file: File) => {
    await uploadExcel(file);
  }, [uploadExcel]);

  const handleNewWbFileChange = useCallback(async (file: File) => {
    setStatus("上传中...");
    try {
      const result = await uploadNewWorkbook(file);
      const list = await fetchWorkbooks();
      setWorkbooks(Array.isArray(list) ? list : []);
      const idx = (Array.isArray(list) ? list : []).findIndex((w) => w.id === result.id);
      if (idx >= 0) {
        setWorkbookIdx(idx);
        const full = await fetchWorkbook(result.id);
        setCurrentWorkbook(full);
        setCurrentSheetIndex(0);
        setRevision(0);
      }
      setStatus("上传完成");
    } catch {
      setStatus("上传失败");
    }
  }, [setWorkbooks, setWorkbookIdx, setCurrentWorkbook, setStatus]);

  const handleWorkbookDelete = useCallback(async (_workbookId: number) => {
    const list = await fetchWorkbooks();
    setWorkbooks(Array.isArray(list) ? list : []);
    const remaining = (Array.isArray(list) ? list : []).filter((w) => w.id !== _workbookId);
    if (remaining.length > 0) {
      const newIdx = 0;
      setWorkbookIdx(newIdx);
      const full = await fetchWorkbook(remaining[0].id);
      setCurrentWorkbook(full);
      setCurrentSheetIndex(0);
    } else {
      setWorkbookIdx(0);
      setCurrentWorkbook(null);
    }
    setRevision(0);
    setStatus("已删除");
  }, [setWorkbooks, setWorkbookIdx, setCurrentWorkbook, setStatus]);

  if (loading) {
    return <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>加载中...</div>;
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <WorkbenchHeader
        workbooks={workbooks}
        activeWorkbookIdx={workbookIdx}
        status={status}
        uploadInputRef={uploadInputRef}
        onSwitchWorkbook={handleSwitchWorkbook}
        onUploadClick={() => uploadInputRef.current?.click()}
        onUploadFileChange={handleUploadFileChange}
        onUploadNewWorkbookClick={() => newWbInputRef.current?.click()}
      />

      <input
        ref={uploadInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUploadFileChange(f);
          e.target.value = "";
        }}
      />

      <input
        ref={newWbInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleNewWbFileChange(f);
          e.target.value = "";
        }}
      />

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <ExcelWorkspace
          workbook={currentWorkbook}
          currentSheetIndex={currentSheetIndex}
          revision={revision}
          onSheetIndexChange={setCurrentSheetIndex}
          onWorkbookDelete={handleWorkbookDelete}
        />
        <ChatSidebar />
      </div>
    </div>
  );
}