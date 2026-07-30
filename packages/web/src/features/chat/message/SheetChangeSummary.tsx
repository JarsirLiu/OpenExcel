import { sheetChangeSummarySchema } from "@openexcel/core";
import { useState } from "react";
import { t } from "@/lib/i18n";
import styles from "./SheetChangeSummary.module.css";
import { SheetPreview } from "./SheetPreview";

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

type SheetChangeEntry = {
  sheetId: number;
  sheetName: string;
  sheetNo?: number;
  lastPreview: any;
  changedRanges: string[];
  changedCellCount: number;
  operationCount: number;
  omittedRangeCount: number;
  truncated: boolean;
};

const MAX_DISPLAY_RANGES = 20;

function collectSheetChanges(parts: any[]): SheetChangeEntry[] {
  const map = new Map<number, SheetChangeEntry>();

  for (const part of parts) {
    if (!isRecord(part) || typeof part.type !== "string" || !part.type.startsWith("tool-"))
      continue;
    if (part.state !== "output-available") continue;
    const output = part.output;
    if (
      !isRecord(output) ||
      !isRecord(output.sheetInfo) ||
      typeof output.sheetInfo.sheetId !== "number"
    )
      continue;

    const sheetId = output.sheetInfo.sheetId;
    if (!map.has(sheetId)) {
      map.set(sheetId, {
        sheetId,
        sheetName:
          typeof output.sheetInfo.sheetName === "string"
            ? output.sheetInfo.sheetName
            : t("sheet_default"),
        sheetNo: output.sheetInfo.sheetNo,
        lastPreview: null,
        changedRanges: [],
        changedCellCount: 0,
        operationCount: 0,
        omittedRangeCount: 0,
        truncated: false,
      });
    }

    const entry = map.get(sheetId)!;
    const parsedSummary = sheetChangeSummarySchema.safeParse(output.changeSummary);
    if (!parsedSummary.success) continue;
    const changeSummary = parsedSummary.data;
    entry.changedCellCount += changeSummary.changedCellCount;
    entry.operationCount += changeSummary.operationCount;
    entry.omittedRangeCount += changeSummary.omittedRangeCount;
    entry.truncated ||= changeSummary.truncated;
    const remaining = Math.max(0, MAX_DISPLAY_RANGES - entry.changedRanges.length);
    entry.changedRanges.push(...changeSummary.changedRanges.slice(0, remaining));
    if (changeSummary.changedRanges.length > remaining) {
      entry.omittedRangeCount += changeSummary.changedRanges.length - remaining;
      entry.truncated = true;
    }

    entry.lastPreview = output.preview ?? null;
  }

  return [...map.values()].filter(
    (entry) => entry.changedCellCount > 0 || entry.operationCount > 0,
  );
}

export function SheetChangeSummary({
  parts,
  onNavigateSheet,
}: {
  parts: any[];
  onNavigateSheet?: (sheetId: number) => void;
}) {
  const [expandedSheets, setExpandedSheets] = useState<Set<number>>(new Set());
  const sheets = collectSheetChanges(parts);
  if (sheets.length === 0) return null;

  const toggleSheet = (sheetId: number) => {
    const next = new Set(expandedSheets);
    if (next.has(sheetId)) next.delete(sheetId);
    else next.add(sheetId);
    setExpandedSheets(next);
  };

  const formatChangeSummary = (sheet: SheetChangeEntry) => {
    const summary: string[] = [];
    if (sheet.changedCellCount > 0) {
      summary.push(t("sheet_changed_cells", { count: sheet.changedCellCount }));
    }
    if (sheet.operationCount > 0) {
      summary.push(t("sheet_operation_count", { count: sheet.operationCount }));
    }
    if (sheet.omittedRangeCount > 0 || sheet.truncated) {
      summary.push(t("sheet_omitted_ranges", { count: sheet.omittedRangeCount }));
    }
    return summary.length > 0 ? summary.join(t("list_separator")) : t("sheet_no_content_change");
  };

  return (
    <div className={styles.summary}>
      <div className={styles.heading}>{t("sheet_changes_heading", { count: sheets.length })}</div>
      {sheets.map((sheet) => (
        <div key={sheet.sheetId} className={styles.sheet}>
          <div className={styles.sheetRow}>
            <button
              type="button"
              className={styles.sheetLink}
              onClick={() => onNavigateSheet?.(sheet.sheetId)}
            >
              <span className={styles.sheetName}>
                {sheet.sheetName}
                {sheet.sheetNo != null ? ` (#${sheet.sheetNo})` : ""}
              </span>
              <span className={styles.changeCount}>{formatChangeSummary(sheet)}</span>
            </button>
            <button
              type="button"
              className={styles.toggle}
              onClick={() => toggleSheet(sheet.sheetId)}
              aria-label={t("sheet_change_toggle", {
                action: expandedSheets.has(sheet.sheetId) ? t("collapse") : t("expand"),
                sheet: sheet.sheetName,
              })}
              aria-expanded={expandedSheets.has(sheet.sheetId)}
            >
              <span className={styles.chevron} aria-hidden="true" />
            </button>
          </div>
          {expandedSheets.has(sheet.sheetId) && sheet.lastPreview && (
            <div className={styles.preview}>
              <SheetPreview preview={sheet.lastPreview} changedRanges={sheet.changedRanges} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
