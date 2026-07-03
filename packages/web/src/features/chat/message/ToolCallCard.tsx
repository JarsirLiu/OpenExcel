import { SheetPreview } from "./SheetPreview";

function isStaticToolPart(part: any): boolean {
  return part.args === undefined && part.input !== undefined;
}

export function ToolCallCard({ part }: { part: any }) {
  const toolName = part.type.startsWith("tool-") ? part.type.slice(5) : part.toolName;
  const state = part.state || "input-streaming";
  const isComplete = state === "output-available" || state === "output-error";
  const isError = state === "output-error";
  const input = isStaticToolPart(part) ? part.input : part.args;
  const summary = typeof input === "object" ? JSON.stringify(input) : String(input ?? "");
  const output = isStaticToolPart(part) ? (part as any).output : undefined;
  const preview = output?.preview ?? null;
  const sheetInfo = output?.sheetInfo ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px", background: "#fafbfc", border: "1px solid #e8ecf0",
        borderRadius: 8, fontSize: 13, color: "#555",
      }}>
        {isComplete ? (
          isError ? (
            <span style={{ color: "#ef4444", fontSize: 14, flexShrink: 0 }}>✕</span>
          ) : (
            <span style={{ color: "#22c55e", fontSize: 14, flexShrink: 0 }}>✓</span>
          )
        ) : (
          <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid #d0d5dd", borderTopColor: "#3b82f6", animation: "spin 0.6s linear infinite", display: "inline-block", flexShrink: 0 }} />
        )}
        <span style={{ fontWeight: 500, color: "#1f1f1f", flexShrink: 0 }}>{toolName}</span>
        <span style={{ color: "#999", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
          {summary}
        </span>
        <span style={{ fontSize: 12, color: isComplete ? (isError ? "#ef4444" : "#22c55e") : "#3b82f6", flexShrink: 0 }}>
          {isComplete ? (isError ? "失败" : "已完成") : "运行中..."}
        </span>
      </div>
      {isComplete && !isError && preview?.rows?.length > 0 && (
        <div style={{ paddingLeft: 22, marginTop: 4 }}>
          <SheetPreview preview={preview} />
        </div>
      )}
      {isComplete && sheetInfo && (
        <div style={{ paddingLeft: 22, marginTop: 2, fontSize: 12, color: "#888" }}>
          修改了 Sheet: {sheetInfo.sheetName} (id: {sheetInfo.sheetId})
        </div>
      )}
    </div>
  );
}
