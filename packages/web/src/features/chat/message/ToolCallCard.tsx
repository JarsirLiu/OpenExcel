import { MAX_CHANGED_RANGES, sheetChangeSummarySchema } from "@openexcel/core";
import { t } from "@/lib/i18n";
import { normalizePreviewData, SheetPreview } from "./SheetPreview";
import styles from "./ToolCallCard.module.css";

const READ_ONLY_TOOLS = new Set(["readSheetData", "readSheetObjects"]);

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

  const sheetInfo = isRecord(output.sheetInfo)
    ? output.sheetInfo
    : isRecord(output.sheet)
      ? output.sheet
      : null;
  const sheetName =
    typeof sheetInfo?.sheetName === "string"
      ? sheetInfo.sheetName
      : typeof sheetInfo?.name === "string"
        ? sheetInfo.name
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
    "readSheetData",
    "readSheetObjects",
    "writeCells",
    "formatCells",
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
      ? t("sheet_number", { number: safeInput.sheetNo })
      : t("sheet_default"));

  switch (toolName) {
    case "readSheetData":
      return t("tool_read_sheet", { sheet: sheetLabel });
    case "readSheetObjects":
      return t("tool_read_sheet_objects", { sheet: sheetLabel });
    case "writeCells":
      return t("tool_write_sheet", { sheet: sheetLabel });
    case "formatCells":
      return t("tool_format_sheet", { sheet: sheetLabel });
    case "clearCells":
      return t("tool_clear_sheet", { sheet: sheetLabel });
    case "mergeCells":
      return t("tool_merge_sheet", { sheet: sheetLabel });
    case "unmergeCells":
      return t("tool_unmerge_sheet", { sheet: sheetLabel });
    default:
      return sheetLabel;
  }
}

function getSheetActionLabel(toolName: string): string {
  switch (toolName) {
    case "readSheetData":
      return t("sheet_action_read");
    case "readSheetObjects":
      return t("sheet_action_read_objects");
    case "writeCells":
      return t("sheet_action_write");
    case "formatCells":
      return t("sheet_action_format");
    case "clearCells":
      return t("sheet_action_clear");
    case "mergeCells":
      return t("sheet_action_merge");
    case "unmergeCells":
      return t("sheet_action_unmerge");
    default:
      return t("sheet_action_generic");
  }
}

export function ToolCallCard({ part }: { part: any }) {
  const toolName =
    typeof part.type === "string" && part.type.startsWith("tool-") ? part.type.slice(5) : "unknown";
  const state = part.state || "input-streaming";
  const isComplete = state === "output-available" || state === "output-error";
  const isError = state === "output-error";
  const input = part.input;
  const output = part.output;
  const summary = getToolSummary(toolName, output, input);
  const preview = normalizePreviewData(output?.preview);
  const isReadOnlyTool = READ_ONLY_TOOLS.has(toolName);
  const sheetInfo = output?.sheetInfo ?? output?.sheet ?? null;
  const parsedChangeSummary = sheetChangeSummarySchema.safeParse(output?.changeSummary);
  const changedRanges = parsedChangeSummary.success
    ? parsedChangeSummary.data.changedRanges.slice(0, MAX_CHANGED_RANGES)
    : undefined;
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
          {isComplete ? (isError ? t("tool_failed") : t("tool_completed")) : t("tool_running")}
        </span>
      </div>
      {isComplete && !isError && !isReadOnlyTool && preview && preview.rows.length > 0 && (
        <div className={styles.preview}>
          <SheetPreview
            preview={preview}
            changedRanges={changedRanges}
            label={output?.previewLabel}
          />
        </div>
      )}
      {isComplete && sheetInfo && (
        <div className={styles.detail}>
          {getSheetActionLabel(toolName)}: {sheetInfo.sheetName ?? sheetInfo.name}
          {sheetInfo.sheetNo != null ? ` (#${sheetInfo.sheetNo})` : ""}
        </div>
      )}
    </div>
  );
}
