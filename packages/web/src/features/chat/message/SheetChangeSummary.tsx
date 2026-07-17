import { useState } from "react";
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
  changedCells: Set<string>;
  changeCount: number;
};

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
          typeof output.sheetInfo.sheetName === "string" ? output.sheetInfo.sheetName : "Sheet",
        sheetNo: output.sheetInfo.sheetNo,
        lastPreview: null,
        changedCells: new Set(),
        changeCount: 0,
      });
    }

    const entry = map.get(sheetId)!;
    const delta = output.delta;

    if (delta && typeof delta === "object") {
      const d = delta as Record<string, unknown>;

      if (d.type === "write" && Array.isArray(d.cells)) {
        for (const c of d.cells) {
          if (
            c &&
            typeof c === "object" &&
            typeof (c as any).row === "number" &&
            typeof (c as any).col === "number"
          ) {
            entry.changedCells.add(`${(c as any).row},${(c as any).col}`);
            entry.changeCount++;
          }
        }
      } else if (d.type === "clear" && Array.isArray(d.operations)) {
        for (const op of d.operations) {
          if (!op || typeof op !== "object") continue;
          const o = op as Record<string, unknown>;
          if (o.type === "cell" && typeof o.row === "number" && typeof o.col === "number") {
            entry.changedCells.add(`${o.row},${o.col}`);
            entry.changeCount++;
          } else if (
            typeof o.startRow === "number" &&
            typeof o.startCol === "number" &&
            typeof o.endRow === "number" &&
            typeof o.endCol === "number"
          ) {
            for (let r = o.startRow; r <= o.endRow; r++) {
              for (let c = o.startCol; c <= o.endCol; c++) {
                entry.changedCells.add(`${r},${c}`);
                entry.changeCount++;
              }
            }
          }
        }
      } else if ((d.type === "merge" || d.type === "unmerge") && Array.isArray(d.operations)) {
        for (const op of d.operations) {
          if (!op || typeof op !== "object") continue;
          const o = op as Record<string, unknown>;
          if (
            typeof o.startRow === "number" &&
            typeof o.startCol === "number" &&
            typeof o.endRow === "number" &&
            typeof o.endCol === "number"
          ) {
            for (let r = o.startRow; r <= o.endRow; r++) {
              for (let c = o.startCol; c <= o.endCol; c++) {
                entry.changedCells.add(`${r},${c}`);
                entry.changeCount++;
              }
            }
          }
        }
      }
    }

    if (output.preview) {
      entry.lastPreview = output.preview;
    }
  }

  return [...map.values()];
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
    if (next.has(sheetId)) {
      next.delete(sheetId);
    } else {
      next.add(sheetId);
    }
    setExpandedSheets(next);
  };

  return (
    <div className={styles.summary}>
      <div className={styles.heading}>修改了 {sheets.length} 个工作表</div>
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
              <span className={styles.changeCount}>{sheet.changeCount} 处改动</span>
            </button>
            <button
              type="button"
              className={styles.toggle}
              onClick={() => toggleSheet(sheet.sheetId)}
              aria-label={`${expandedSheets.has(sheet.sheetId) ? "收起" : "展开"} ${sheet.sheetName} 变更预览`}
              aria-expanded={expandedSheets.has(sheet.sheetId)}
            >
              <span className={styles.chevron} aria-hidden="true" />
            </button>
          </div>
          {expandedSheets.has(sheet.sheetId) && sheet.lastPreview && (
            <div className={styles.preview}>
              <SheetPreview preview={sheet.lastPreview} changedCells={sheet.changedCells} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
