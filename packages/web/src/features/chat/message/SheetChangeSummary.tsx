import { useState } from "react";
import { SheetPreview } from "./SheetPreview";

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
    if (!part.type?.startsWith("tool-")) continue;
    if (part.state !== "output-available") continue;
    const output = part.output;
    if (!output?.sheetInfo?.sheetId) continue;

    const sheetId = output.sheetInfo.sheetId;
    if (!map.has(sheetId)) {
      map.set(sheetId, {
        sheetId,
        sheetName: output.sheetInfo.sheetName,
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
    <div style={{ marginTop: 12 }}>
      <div
        style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 6 }}
      >
        修改了 {sheets.length} 个工作表
      </div>
      {sheets.map((sheet) => (
        <div key={sheet.sheetId} style={{ marginBottom: 4 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              padding: "6px 8px",
              background: "var(--muted)",
              borderRadius: "var(--radius-sm)",
              fontSize: 13,
              border: "1px solid var(--border)",
            }}
            onClick={() => onNavigateSheet?.(sheet.sheetId)}
          >
            <span style={{ fontWeight: 500, color: "var(--foreground)" }}>
              {sheet.sheetName}
              {sheet.sheetNo != null ? ` (#${sheet.sheetNo})` : ""}
            </span>
            <span style={{ color: "var(--hint-foreground)", fontSize: 12 }}>
              {sheet.changeCount} 处改动
            </span>
            <span
              style={{
                marginLeft: "auto",
                flexShrink: 0,
                color: "var(--muted-foreground)",
                fontSize: 10,
                cursor: "pointer",
                padding: "2px 4px",
                borderRadius: "var(--radius-sm)",
                transition: "transform 0.15s",
                transform: expandedSheets.has(sheet.sheetId) ? "rotate(90deg)" : "rotate(0deg)",
              }}
              onClick={(e) => {
                e.stopPropagation();
                toggleSheet(sheet.sheetId);
              }}
            >
              ▶
            </span>
          </div>
          {expandedSheets.has(sheet.sheetId) && sheet.lastPreview && (
            <div style={{ paddingLeft: 16, marginTop: 4 }}>
              <SheetPreview preview={sheet.lastPreview} changedCells={sheet.changedCells} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
