import { toolColumnToA1Ref, toolIndex, toolRangeToA1Ref } from "@openexcel/core";

interface PreviewMerge {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
  clipped: boolean;
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

type PreviewRange = PreviewData["range"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isPreviewRange(value: unknown): value is PreviewRange {
  if (!isRecord(value)) return false;
  return (
    isInteger(value.startRow) &&
    isInteger(value.endRow) &&
    isInteger(value.startCol) &&
    isInteger(value.endCol) &&
    value.startRow >= 1 &&
    value.endRow >= value.startRow &&
    value.startCol >= 1 &&
    value.endCol >= value.startCol
  );
}

function isPreviewRow(value: unknown, range: PreviewRange): value is PreviewRow {
  if (!isRecord(value) || !isInteger(value.row) || !Array.isArray(value.values)) return false;
  return (
    value.row >= range.startRow &&
    value.row <= range.endRow &&
    value.values.every((cell) => typeof cell === "string")
  );
}

function isPreviewMerge(value: unknown, range: PreviewRange): value is PreviewMerge {
  if (
    !isRecord(value) ||
    !isInteger(value.startRow) ||
    !isInteger(value.startCol) ||
    !isInteger(value.endRow) ||
    !isInteger(value.endCol) ||
    typeof value.clipped !== "boolean"
  ) {
    return false;
  }
  return (
    value.startRow >= range.startRow &&
    value.endRow <= range.endRow &&
    value.startCol >= range.startCol &&
    value.endCol <= range.endCol &&
    value.endRow >= value.startRow &&
    value.endCol >= value.startCol
  );
}

export function normalizePreviewData(value: unknown): PreviewData | null {
  if (!isRecord(value)) return null;

  const range = value.range;
  if (
    typeof value.sheetId !== "number" ||
    typeof value.sheetName !== "string" ||
    value.sheetName.length === 0 ||
    !Number.isInteger(value.sheetId) ||
    !isPreviewRange(range) ||
    !Array.isArray(value.rows) ||
    !Array.isArray(value.merges)
  ) {
    return null;
  }

  if (!value.rows.every((row) => isPreviewRow(row, range))) return null;
  if (!value.merges.every((merge) => isPreviewMerge(merge, range))) return null;

  return {
    sheetId: value.sheetId,
    sheetName: value.sheetName,
    range,
    rows: value.rows,
    merges: value.merges,
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
  label = "变更区域",
}: {
  preview: unknown;
  changedCells?: ReadonlySet<string>;
  label?: string;
}) {
  const preview = normalizePreviewData(rawPreview);
  if (!preview) return null;

  const mergeMap = buildMergeMap(preview.merges);
  const skipped = new Set<string>();
  const colBase = preview.range.startCol;
  const columnCount = Math.max(
    preview.range.endCol - preview.range.startCol + 1,
    ...preview.rows.map((row) => row.values.length),
  );
  const columns = Array.from({ length: columnCount }, (_, index) => colBase + index);
  const rangeLabel = toolRangeToA1Ref({
    startRow: toolIndex(preview.range.startRow),
    startCol: toolIndex(preview.range.startCol),
    endRow: toolIndex(preview.range.endRow),
    endCol: toolIndex(preview.range.endCol),
  });

  return (
    <div style={{ marginTop: 8 }}>
      <div
        style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)", marginBottom: 4 }}
      >
        {preview.sheetName} — {label} ({rangeLabel})
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
          <thead>
            <tr>
              <th
                aria-label="行列标题"
                style={{
                  border: "1px solid var(--border)",
                  padding: "4px 8px",
                  background: "var(--muted)",
                  minWidth: 34,
                }}
              />
              {columns.map((col) => (
                <th
                  key={col}
                  scope="col"
                  style={{
                    border: "1px solid var(--border)",
                    padding: "4px 8px",
                    background: "var(--muted)",
                    color: "var(--foreground)",
                    fontWeight: 600,
                    minWidth: 60,
                  }}
                >
                  {toolColumnToA1Ref(toolIndex(col))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => (
              <tr key={row.row}>
                <th
                  scope="row"
                  style={{
                    border: "1px solid var(--border)",
                    padding: "4px 8px",
                    background: "var(--muted)",
                    color: "var(--foreground)",
                    fontWeight: 600,
                  }}
                >
                  {row.row}
                </th>
                {columns.map((col, ci) => {
                  const val = row.values[ci] ?? "";
                  const key = `${row.row},${col}`;
                  if (skipped.has(key)) return null;
                  const merge = mergeMap.get(key);
                  if (merge) {
                    for (let r = row.row; r < row.row + merge.rs; r++) {
                      for (let c = col; c < col + merge.cs; c++) {
                        if (r !== row.row || c !== col) skipped.add(`${r},${c}`);
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
                          : row.row === preview.range.startRow
                            ? "var(--muted)"
                            : "var(--background)",
                        fontWeight: row.row === preview.range.startRow ? 600 : 400,
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
