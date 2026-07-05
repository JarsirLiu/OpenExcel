import { SheetPreview } from "./SheetPreview";

function isStaticToolPart(part: any): boolean {
  return part.args === undefined && part.input !== undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function redactSheetIds(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSheetIds);
  }

  if (!isRecord(value)) {
    return value;
  }

  const entries = Object.entries(value).filter(([key]) => key !== "sheetId");
  return Object.fromEntries(entries.map(([key, nestedValue]) => [key, redactSheetIds(nestedValue)]));
}

function getSheetLabel(output: unknown): string | null {
  if (!isRecord(output)) return null;

  const sheetInfo = isRecord(output.sheetInfo) ? output.sheetInfo : null;
  const sheetName = typeof sheetInfo?.sheetName === "string"
    ? sheetInfo.sheetName
    : typeof output.sheetName === "string"
      ? output.sheetName
      : null;
  const sheetNo = typeof sheetInfo?.sheetNo === "number"
    ? sheetInfo.sheetNo
    : typeof output.sheetNo === "number"
      ? output.sheetNo
      : null;

  if (!sheetName && sheetNo == null) return null;
  if (!sheetName) return `Sheet #${sheetNo}`;
  return sheetNo == null ? sheetName : `${sheetName} (#${sheetNo})`;
}

function getToolSummary(toolName: string, output: unknown, input: unknown): string {
  const isSheetTool = ["readSheet", "writeCells", "clearCells", "mergeCells", "unmergeCells"].includes(toolName);
  const safeInput = redactSheetIds(input);
  if (!isSheetTool) {
    return typeof safeInput === "object" ? JSON.stringify(safeInput) : String(safeInput ?? "");
  }

  const sheetLabel = getSheetLabel(output)
    ?? (isRecord(safeInput) && typeof safeInput.sheetNo === "number" ? `Sheet #${safeInput.sheetNo}` : "Sheet");

  switch (toolName) {
    case "readSheet":
      return `读取 ${sheetLabel}`;
    case "writeCells":
      return `写入 ${sheetLabel}`;
    case "clearCells":
      return `清空 ${sheetLabel}`;
    case "mergeCells":
      return `合并 ${sheetLabel}`;
    case "unmergeCells":
      return `取消合并 ${sheetLabel}`;
    default:
      return sheetLabel;
  }
}

function getSheetActionLabel(toolName: string): string {
  switch (toolName) {
    case "readSheet":
      return "读取了 Sheet";
    case "writeCells":
      return "修改了 Sheet";
    case "clearCells":
      return "清空了 Sheet";
    case "mergeCells":
      return "合并了 Sheet";
    case "unmergeCells":
      return "取消合并了 Sheet";
    default:
      return "处理了 Sheet";
  }
}

export function ToolCallCard({ part }: { part: any }) {
  const toolName = part.type.startsWith("tool-") ? part.type.slice(5) : part.toolName;
  const state = part.state || "input-streaming";
  const isComplete = state === "output-available" || state === "output-error";
  const isError = state === "output-error";
  const input = isStaticToolPart(part) ? part.input : part.args;
  const output = isStaticToolPart(part) ? (part as any).output : undefined;
  const summary = getToolSummary(toolName, output, input);
  const preview = output?.preview ?? null;
  const sheetInfo = output?.sheetInfo ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px", background: "var(--muted)", border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)", fontSize: 13, color: "var(--muted-foreground)",
      }}>
        {isComplete ? (
          isError ? (
            <span style={{ color: "#ef4444", fontSize: 14, flexShrink: 0 }}>✕</span>
          ) : (
            <span style={{ color: "#22c55e", fontSize: 14, flexShrink: 0 }}>✓</span>
          )
        ) : (
          <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "#3b82f6", animation: "spin 0.6s linear infinite", display: "inline-block", flexShrink: 0 }} />
        )}
        <span style={{ fontWeight: 500, color: "var(--foreground)", flexShrink: 0 }}>{toolName}</span>
        <span style={{ color: "var(--hint-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
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
        <div style={{ paddingLeft: 22, marginTop: 2, fontSize: 12, color: "var(--hint-foreground)" }}>
          {getSheetActionLabel(toolName)}: {sheetInfo.sheetName}
          {sheetInfo.sheetNo != null ? ` (#${sheetInfo.sheetNo})` : ""}
        </div>
      )}
    </div>
  );
}
