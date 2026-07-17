interface PreviewMerge {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

interface PreviewRow {
  row: number;
  values: string[];
}

export interface PreviewData {
  sheetId: number;
  sheetName: string;
  range: { startRow: number; endRow: number; startCol: number; endCol: number };
  rows: PreviewRow[];
  merges: PreviewMerge[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatPreviewValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(formatPreviewValue).join(", ");
  if (isRecord(value)) {
    if ("value" in value) return formatPreviewValue(value.value);
    if ("v" in value) return formatPreviewValue(value.v);
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value);
}

/**
 * 兼容两种历史输入：
 * - 新规范：`{ row, values }[]`，行号由服务端显式给出。
 * - 旧规范：`string[][]` 或 `{ values: [] }[]`，行号回退到 `range.startRow + index`。
 *
 * 服务端始终输出新规范；这里的回退只为容错，不进行任何坐标换算。
 */
function normalizePreviewRows(value: unknown, fallbackStartRow: number): PreviewRow[] {
  if (!Array.isArray(value)) return [];

  return value.map((row, index) => {
    if (isRecord(row)) {
      if (typeof row.row === "number" && Array.isArray(row.values)) {
        return { row: row.row, values: row.values.map(formatPreviewValue) };
      }
      if (Array.isArray(row.values)) {
        return {
          row: fallbackStartRow + index,
          values: row.values.map(formatPreviewValue),
        };
      }
      const numericKeys = Object.keys(row)
        .filter((key) => /^\d+$/.test(key))
        .sort((a, b) => Number(a) - Number(b));
      if (numericKeys.length > 0) {
        return {
          row: fallbackStartRow + index,
          values: numericKeys.map((key) => formatPreviewValue(row[key])),
        };
      }
    }
    if (Array.isArray(row)) {
      return { row: fallbackStartRow + index, values: row.map(formatPreviewValue) };
    }
    return { row: fallbackStartRow + index, values: [formatPreviewValue(row)] };
  });
}

export function normalizePreviewData(value: unknown): PreviewData | null {
  if (!isRecord(value)) return null;

  const range = isRecord(value.range) ? value.range : {};
  const startRow = typeof range.startRow === "number" ? range.startRow : 1;
  const endRow = typeof range.endRow === "number" ? range.endRow : 1;
  const startCol = typeof range.startCol === "number" ? range.startCol : 1;
  const endCol = typeof range.endCol === "number" ? range.endCol : 1;
  const merges = Array.isArray(value.merges)
    ? value.merges.filter(
        (merge): merge is PreviewMerge =>
          isRecord(merge) &&
          typeof merge.startRow === "number" &&
          typeof merge.startCol === "number" &&
          typeof merge.endRow === "number" &&
          typeof merge.endCol === "number",
      )
    : [];

  return {
    sheetId: typeof value.sheetId === "number" ? value.sheetId : 0,
    sheetName: typeof value.sheetName === "string" ? value.sheetName : "Sheet",
    range: { startRow, endRow, startCol, endCol },
    rows: normalizePreviewRows(value.rows, startRow),
    merges,
  };
}

function buildMergeMap(merges: PreviewMerge[]): Map<string, { rs: number; cs: number }> {
  const map = new Map<string, { rs: number; cs: number }>();
  for (const m of merges) {
    map.set(`${m.startRow},${m.startCol}`, {
      rs: m.endRow - m.startRow + 1,
      cs: m.endCol - m.startCol + 1,
    });
  }
  return map;
}

export function SheetPreview({
  preview: rawPreview,
  changedCells,
}: {
  preview: unknown;
  changedCells?: ReadonlySet<string>;
}) {
  const preview = normalizePreviewData(rawPreview);
  if (!preview) return null;

  const mergeMap = buildMergeMap(preview.merges);
  const skipped = new Set<string>();
  const colBase = preview.range.startCol;

  return (
    <div style={{ marginTop: 8 }}>
      <div
        style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 4 }}
      >
        {preview.sheetName} — 变更区域
      </div>
      <div style={{ overflowX: "auto", maxHeight: 300, overflowY: "auto" }}>
        <table
          style={{
            borderCollapse: "collapse",
            fontSize: 12,
            width: "100%",
            minWidth: 200,
          }}
        >
          <tbody>
            {preview.rows.map((row, ri) => (
              <tr key={ri}>
                {row.values.map((val, ci) => {
                  const key = `${row.row},${ci + colBase}`;
                  if (skipped.has(key)) return null;
                  const merge = mergeMap.get(key);
                  if (merge) {
                    for (let r = row.row; r < row.row + merge.rs; r++) {
                      for (let c = ci + colBase; c < ci + colBase + merge.cs; c++) {
                        if (r !== row.row || c !== ci + colBase) skipped.add(`${r},${c}`);
                      }
                    }
                  }
                  return (
                    <td
                      key={ci}
                      rowSpan={merge?.rs ?? 1}
                      colSpan={merge?.cs ?? 1}
                      style={{
                        border: "1px solid var(--border)",
                        padding: "4px 8px",
                        whiteSpace: "nowrap",
                        minWidth: 60,
                        background: changedCells?.has(key)
                          ? "#d4edda"
                          : ri === 0
                            ? "var(--muted)"
                            : "var(--background)",
                        fontWeight: ri === 0 ? 600 : 400,
                        color: "var(--foreground)",
                        fontSize: 12,
                      }}
                    >
                      {val || ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
