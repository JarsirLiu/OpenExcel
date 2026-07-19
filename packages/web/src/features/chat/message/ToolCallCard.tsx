import { normalizePreviewData, SheetPreview } from "./SheetPreview";
import styles from "./ToolCallCard.module.css";

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
  return Object.fromEntries(
    entries.map(([key, nestedValue]) => [key, redactSheetIds(nestedValue)]),
  );
}

function getSheetLabel(output: unknown): string | null {
  if (!isRecord(output)) return null;

  const sheetInfo = isRecord(output.sheetInfo) ? output.sheetInfo : null;
  const sheetName =
    typeof sheetInfo?.sheetName === "string"
      ? sheetInfo.sheetName
      : typeof output.sheetName === "string"
        ? output.sheetName
        : null;
  const sheetNo =
    typeof sheetInfo?.sheetNo === "number"
      ? sheetInfo.sheetNo
      : typeof output.sheetNo === "number"
        ? output.sheetNo
        : null;

  if (!sheetName && sheetNo == null) return null;
  if (!sheetName) return `Sheet #${sheetNo}`;
  return sheetNo == null ? sheetName : `${sheetName} (#${sheetNo})`;
}

function getToolSummary(toolName: string, output: unknown, input: unknown): string {
  const isSheetTool = [
    "readSheet",
    "writeCells",
    "clearCells",
    "mergeCells",
    "unmergeCells",
  ].includes(toolName);
  const safeInput = redactSheetIds(input);
  if (!isSheetTool) {
    return typeof safeInput === "object" ? JSON.stringify(safeInput) : String(safeInput ?? "");
  }

  const sheetLabel =
    getSheetLabel(output) ??
    (isRecord(safeInput) && typeof safeInput.sheetNo === "number"
      ? `Sheet #${safeInput.sheetNo}`
      : "Sheet");

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

function computeChangedCells(delta: unknown): Set<string> | undefined {
  if (!delta || typeof delta !== "object") return undefined;

  const d = delta as Record<string, unknown>;
  const cells: string[] = [];

  if (d.type === "write" && Array.isArray(d.cells)) {
    for (const c of d.cells) {
      if (
        c &&
        typeof c === "object" &&
        typeof (c as any).row === "number" &&
        typeof (c as any).col === "number"
      ) {
        cells.push(`${(c as any).row},${(c as any).col}`);
      }
    }
  } else if (
    (d.type === "clear" || d.type === "merge" || d.type === "unmerge") &&
    Array.isArray(d.operations)
  ) {
    for (const op of d.operations) {
      if (!op || typeof op !== "object") continue;
      const o = op as Record<string, unknown>;
      if (o.type === "cell" && typeof o.row === "number" && typeof o.col === "number") {
        cells.push(`${o.row},${o.col}`);
      } else if (
        typeof o.startRow === "number" &&
        typeof o.startCol === "number" &&
        typeof o.endRow === "number" &&
        typeof o.endCol === "number"
      ) {
        for (let r = o.startRow; r <= o.endRow; r++) {
          for (let c = o.startCol; c <= o.endCol; c++) {
            cells.push(`${r},${c}`);
          }
        }
      }
    }
  }

  return cells.length > 0 ? new Set(cells) : undefined;
}

export function ToolCallCard({ part }: { part: any }) {
  const toolName = part.type.startsWith("tool-") ? part.type.slice(5) : part.toolName;
  const state = part.state || "input-streaming";
  const isComplete = state === "output-available" || state === "output-error";
  const isError = state === "output-error";
  const input = isStaticToolPart(part) ? part.input : part.args;
  const output = isStaticToolPart(part) ? (part as any).output : undefined;
  const summary = getToolSummary(toolName, output, input);
  const preview = normalizePreviewData(output?.preview);
  const sheetInfo = output?.sheetInfo ?? null;
  const changedCells = computeChangedCells(output?.delta);
  const stateClass = isComplete
    ? isError
      ? styles.stateError
      : styles.stateSuccess
    : styles.statePending;

  return (
    <div className={styles.tool}>
      <div className={styles.row}>
        {isComplete ? (
          isError ? (
            <span className={`${styles.status} ${styles.error}`} aria-hidden="true">
              ×
            </span>
          ) : (
            <span className={`${styles.status} ${styles.success}`} aria-hidden="true">
              ✓
            </span>
          )
        ) : (
          <span className={`${styles.status} ${styles.pending}`} aria-hidden="true" />
        )}
        <span className={styles.name}>{toolName}</span>
        <span className={styles.summary}>{summary}</span>
        <span className={`${styles.state} ${stateClass}`}>
          {isComplete ? (isError ? "失败" : "已完成") : "运行中..."}
        </span>
      </div>
      {isComplete && !isError && preview && preview.rows.length > 0 && (
        <div className={styles.preview}>
          <SheetPreview
            preview={preview}
            changedCells={changedCells}
            label={output?.previewLabel}
          />
        </div>
      )}
      {isComplete && sheetInfo && (
        <div className={styles.detail}>
          {getSheetActionLabel(toolName)}: {sheetInfo.sheetName}
          {sheetInfo.sheetNo != null ? ` (#${sheetInfo.sheetNo})` : ""}
        </div>
      )}
    </div>
  );
}
