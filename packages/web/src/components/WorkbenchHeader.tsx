import type { RefObject } from "react";

type WorkbookTab = {
  id: number;
  name: string;
};

interface Props {
  workbooks: WorkbookTab[];
  activeWorkbookIdx: number;
  status: string;
  uploadInputRef: RefObject<HTMLInputElement>;
  onSwitchWorkbook: (index: number) => void;
  onDownloadTemplate: () => void;
  onUploadClick: () => void;
  onUploadFileChange: (file: File) => void;
  onCreateSheet: () => void;
  onDeleteSheet: () => void;
}

export function WorkbenchHeader({
  workbooks,
  activeWorkbookIdx,
  status,
  uploadInputRef,
  onSwitchWorkbook,
  onDownloadTemplate,
  onUploadClick,
  onUploadFileChange,
  onCreateSheet,
  onDeleteSheet,
}: Props) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px 0", background: "linear-gradient(180deg, #f6f7fb 0%, #eceff5 100%)", borderBottom: "1px solid #cfd6e4" }}>
        <div style={{ display: "flex", gap: 6, flex: 1, alignItems: "stretch", overflowX: "auto", paddingBottom: 6 }}>
          {workbooks.map((wb, i) => (
            <div
              key={wb.id}
              onClick={() => onSwitchWorkbook(i)}
              style={{
                padding: "8px 14px",
                cursor: "pointer",
                border: "1px solid",
                borderColor: i === activeWorkbookIdx ? "#c6d4ea #c6d4ea #fff" : "#d8dee9 #d8dee9 #c7cedb",
                borderBottom: i === activeWorkbookIdx ? "1px solid #fff" : "1px solid #c7cedb",
                borderRadius: "8px 8px 0 0",
                background: i === activeWorkbookIdx ? "#fff" : "linear-gradient(180deg, #f4f6f9 0%, #e4e9f1 100%)",
                boxShadow: i === activeWorkbookIdx ? "0 -1px 0 #fff inset" : "none",
                fontWeight: i === activeWorkbookIdx ? 600 : 500,
                color: i === activeWorkbookIdx ? "#1f2a37" : "#5b6473",
                fontSize: 13,
                whiteSpace: "nowrap",
              }}
            >
              {wb.name}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, paddingBottom: 6 }}>
          <button onClick={onDownloadTemplate} style={{ fontSize: 12 }}>下载模板</button>
          <button onClick={onUploadClick} style={{ fontSize: 12 }}>导入数据</button>
          <button onClick={onCreateSheet} style={{ fontSize: 12 }}>新建 Sheet</button>
          <button onClick={onDeleteSheet} style={{ fontSize: 12 }}>删除当前 Sheet</button>
        </div>
        {status && <span style={{ fontSize: 12, color: status.includes("失败") ? "#d32f2f" : "#2e7d32" }}>{status}</span>}
      </div>

      <input
        ref={uploadInputRef}
        type="file"
        accept=".xlsx,.xls"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUploadFileChange(f);
          e.target.value = "";
        }}
      />
    </>
  );
}
