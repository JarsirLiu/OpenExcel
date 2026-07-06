const UploadIcon = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const FileIcon = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);

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
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 12px 0", background: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", gap: 4, flex: 1, alignItems: "stretch", overflowX: "auto", paddingBottom: 4 }}>
        {workbooks.map((wb, i) => (
          <div
            key={wb.id}
            onClick={() => onSwitchWorkbook(i)}
            style={{
              padding: "6px 12px",
              cursor: "pointer",
              borderRadius: "8px 8px 0 0",
              background: i === activeWorkbookIdx ? "var(--background)" : "var(--muted)",
              border: i === activeWorkbookIdx ? "1px solid var(--border) 1px solid var(--border) 1px solid var(--background)" : "1px solid transparent",
              borderRightColor: i === activeWorkbookIdx ? "var(--border)" : "transparent",
              borderLeftColor: i === activeWorkbookIdx ? "var(--border)" : "transparent",
              fontWeight: i === activeWorkbookIdx ? 600 : 500,
              color: i === activeWorkbookIdx ? "var(--foreground)" : "var(--muted-foreground)",
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
          >
            {wb.name}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 4, paddingBottom: 4 }}>
        <button
          onClick={onUploadClick}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "3px 8px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-pill)",
            background: "var(--background)",
            color: "var(--foreground)",
            fontSize: 11, fontWeight: 500,
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          <UploadIcon /> 导入
        </button>
        <button
          onClick={onUploadNewWorkbookClick}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "3px 8px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-pill)",
            background: "var(--background)",
            color: "var(--foreground)",
            fontSize: 11, fontWeight: 500,
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          <FileIcon /> 上传
        </button>
        {status && <span style={{ fontSize: 11, color: status.includes("失败") ? "#ef4444" : "#22c55e", fontWeight: 500 }}>{status}</span>}
      </div>
    </div>
  );
}
