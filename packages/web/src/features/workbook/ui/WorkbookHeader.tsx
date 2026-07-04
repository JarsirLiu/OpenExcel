type WorkbookTab = {
  id: number;
  name: string;
};

interface Props {
  workbooks: WorkbookTab[];
  activeWorkbookIdx: number;
  status: string;
  onSwitchWorkbook: (index: number) => void;
  onUploadClick: () => void;
  onUploadNewWorkbookClick: () => void;
}

export function WorkbookHeader({
  workbooks,
  activeWorkbookIdx,
  status,
  onSwitchWorkbook,
  onUploadClick,
  onUploadNewWorkbookClick,
}: Props) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px 0", background: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: 6, flex: 1, alignItems: "stretch", overflowX: "auto", paddingBottom: 6 }}>
          {workbooks.map((wb, i) => (
            <div
              key={wb.id}
              onClick={() => onSwitchWorkbook(i)}
              style={{
                padding: "8px 14px",
                cursor: "pointer",
                borderRadius: "var(--radius) var(--radius) 0 0",
                background: i === activeWorkbookIdx ? "var(--background)" : "var(--muted)",
                border: i === activeWorkbookIdx ? "1px solid var(--border) 1px solid var(--border) 1px solid var(--background)" : "1px solid transparent",
                borderRightColor: i === activeWorkbookIdx ? "var(--border)" : "transparent",
                borderLeftColor: i === activeWorkbookIdx ? "var(--border)" : "transparent",
                fontWeight: i === activeWorkbookIdx ? 600 : 500,
                color: i === activeWorkbookIdx ? "var(--foreground)" : "var(--muted-foreground)",
                fontSize: 13,
                whiteSpace: "nowrap",
              }}
            >
              {wb.name}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, paddingBottom: 6 }}>
          <button onClick={onUploadClick} style={{ fontSize: 12 }}>导入数据</button>
          <button onClick={onUploadNewWorkbookClick} style={{ fontSize: 12 }}>上传 Excel</button>
        </div>
        {status && <span style={{ fontSize: 12, color: status.includes("失败") ? "#d32f2f" : "#2e7d32" }}>{status}</span>}
      </div>
    </>
  );
}
