interface PreviewMerge {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

interface PreviewData {
  sheetId: number;
  sheetName: string;
  range: { startRow: number; endRow: number; startCol: number; endCol: number };
  rows: string[][];
  merges: PreviewMerge[];
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

export function SheetPreview({ preview }: { preview: PreviewData }) {
  const mergeMap = buildMergeMap(preview.merges);
  const skipped = new Set<string>();

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#555", marginBottom: 4 }}>
        {preview.sheetName} — 变更区域
      </div>
      <div style={{ overflowX: "auto" }}>
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
                {row.map((val, ci) => {
                  const key = `${ri},${ci}`;
                  if (skipped.has(key)) return null;
                  const merge = mergeMap.get(key);
                  if (merge) {
                    for (let r = ri; r < ri + merge.rs; r++) {
                      for (let c = ci; c < ci + merge.cs; c++) {
                        if (r !== ri || c !== ci) skipped.add(`${r},${c}`);
                      }
                    }
                  }
                  return (
                    <td
                      key={ci}
                      rowSpan={merge?.rs ?? 1}
                      colSpan={merge?.cs ?? 1}
                      style={{
                        border: "1px solid #d0d5dd",
                        padding: "4px 8px",
                        whiteSpace: "nowrap",
                        minWidth: 60,
                        background: ri === 0 ? "#f6f8fa" : "#fff",
                        fontWeight: ri === 0 ? 600 : 400,
                        color: "#1f1f1f",
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