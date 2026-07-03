import { createPortal } from "react-dom";
import { useMemo } from "react";
import type { WorkbookImportPreview, ImportSheetPreview } from "./importPreview";
import { getCellSignature, makeDisplayGrid } from "./importPreview";

interface Props {
  open: boolean;
  preview: WorkbookImportPreview | null;
  activeSheetIndex: number;
  onSheetIndexChange: (index: number) => void;
  onCancel: () => void;
  onConfirm: () => void;
  confirming?: boolean;
}

function columnLabel(index: number) {
  let n = index + 1;
  let label = "";
  while (n > 0) {
    const remainder = (n - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

function statusStyle(status: ImportSheetPreview["status"]) {
  switch (status) {
    case "matched":
      return { bg: "#e9f8ee", fg: "#1b7f3a", text: "已匹配" };
    case "missing":
      return { bg: "#fff3db", fg: "#a96b00", text: "当前缺失" };
    case "extra":
      return { bg: "#eaf2ff", fg: "#2457c5", text: "文件多出" };
  }
}

export function ImportPreviewDialog({
  open,
  preview,
  activeSheetIndex,
  onSheetIndexChange,
  onCancel,
  onConfirm,
  confirming,
}: Props) {
  const activeSheet = preview?.sheets[activeSheetIndex] ?? preview?.sheets[0];

  const diffState = useMemo(() => {
    if (!activeSheet) {
      return {
        currentGrid: [[] as string[]],
        uploadedGrid: [[] as string[]],
        currentMap: new Map<string, string>(),
        uploadedMap: new Map<string, string>(),
        rows: 1,
        cols: 1,
      };
    }

    const rows = Math.max(activeSheet.currentRows, activeSheet.uploadedRows, 1);
    const cols = Math.max(activeSheet.currentCols, activeSheet.uploadedCols, 1);
    const currentGrid = makeDisplayGrid(activeSheet.currentCells, cols, rows);
    const uploadedGrid = makeDisplayGrid(activeSheet.uploadedCells, cols, rows);
    const currentMap = new Map<string, string>();
    const uploadedMap = new Map<string, string>();

    for (const cell of activeSheet.currentCells) {
      currentMap.set(`${cell.r},${cell.c}`, getCellSignature(cell));
    }
    for (const cell of activeSheet.uploadedCells) {
      uploadedMap.set(`${cell.r},${cell.c}`, getCellSignature(cell));
    }

    return { currentGrid, uploadedGrid, currentMap, uploadedMap, rows, cols };
  }, [activeSheet]);

  const highlightState = useMemo(() => {
    const currentHighlights = new Map<string, "added" | "removed" | "changed">();
    const uploadedHighlights = new Map<string, "added" | "removed" | "changed">();

    for (let row = 0; row < diffState.rows; row++) {
      for (let col = 0; col < diffState.cols; col++) {
        const key = `${row},${col}`;
        const currentSig = diffState.currentMap.get(key) ?? "";
        const uploadedSig = diffState.uploadedMap.get(key) ?? "";
        if (currentSig === uploadedSig) continue;
        if (currentSig && !uploadedSig) {
          currentHighlights.set(key, "removed");
        } else if (!currentSig && uploadedSig) {
          uploadedHighlights.set(key, "added");
        } else {
          currentHighlights.set(key, "changed");
          uploadedHighlights.set(key, "changed");
        }
      }
    }

    return { currentHighlights, uploadedHighlights };
  }, [diffState]);

  if (!open || !preview || !activeSheet) return null;

  const activeStatus = statusStyle(activeSheet.status);

  const renderGrid = (
    title: string,
    grid: string[][],
    highlights: Map<string, "added" | "removed" | "changed">,
    side: "current" | "uploaded",
  ) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#1f2a37" }}>{title}</div>
      <div style={{ maxHeight: "52vh", overflow: "auto", border: "1px solid #d7dee8", borderRadius: 8, background: "#fff" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ position: "sticky", top: 0, background: "#f7f9fc", borderBottom: "1px solid #d7dee8", padding: "6px 8px", width: 48, zIndex: 1 }}>#</th>
              {grid[0]?.map((_, col) => (
                <th key={col} style={{ position: "sticky", top: 0, background: "#f7f9fc", borderBottom: "1px solid #d7dee8", padding: "6px 8px", minWidth: 92, zIndex: 1 }}>
                  {columnLabel(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th style={{ position: "sticky", left: 0, background: "#f7f9fc", borderRight: "1px solid #d7dee8", borderBottom: "1px solid #edf1f5", padding: "6px 8px", textAlign: "right", minWidth: 48, zIndex: 0 }}>
                  {rowIndex + 1}
                </th>
                {row.map((cell, colIndex) => {
                  const key = `${rowIndex},${colIndex}`;
                  const kind = highlights.get(key);
                  const background =
                    kind === "added"
                      ? "#e9f8ee"
                      : kind === "removed"
                        ? "#fdeeee"
                        : kind === "changed"
                          ? "#fff3db"
                          : "#fff";
                  const color =
                    kind === "added"
                      ? "#1b7f3a"
                      : kind === "removed"
                        ? "#b23b3b"
                        : kind === "changed"
                          ? "#a96b00"
                          : "#1f2a37";

                  return (
                    <td
                      key={colIndex}
                      style={{
                        borderBottom: "1px solid #edf1f5",
                        borderLeft: "1px solid #edf1f5",
                        padding: "6px 8px",
                        background,
                        color,
                        minWidth: 92,
                        whiteSpace: "nowrap",
                      }}
                      title={cell}
                    >
                      {cell || " "}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
        {side === "current" ? "左侧为当前工作簿数据" : "右侧为上传文件数据"}
      </div>
    </div>
  );

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !confirming) onCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.48)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "min(1280px, 100%)",
          maxHeight: "100%",
          overflow: "hidden",
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 18px 60px rgba(15, 23, 42, 0.24)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "18px 20px 12px", borderBottom: "1px solid #e6ebf2", background: "linear-gradient(180deg, #fbfcfe 0%, #f4f7fb 100%)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>导入预览</div>
              <div style={{ marginTop: 4, fontSize: 13, color: "#6b7280" }}>
                当前工作簿「{preview.workbookName}」与文件「{preview.fileName}」的 sheet 内容对比
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onCancel} disabled={confirming} style={{ fontSize: 13, padding: "6px 14px", border: "1px solid #d1d7e0", borderRadius: 8, background: "#fff", cursor: confirming ? "not-allowed" : "pointer" }}>
                取消
              </button>
              <button onClick={onConfirm} disabled={confirming} style={{ fontSize: 13, padding: "6px 14px", border: "1px solid #1f6feb", borderRadius: 8, background: confirming ? "#7ca7f7" : "#1f6feb", color: "#fff", cursor: confirming ? "not-allowed" : "pointer" }}>
                {confirming ? "导入中..." : "确认导入"}
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
            <div style={{ padding: "8px 12px", borderRadius: 999, background: "#eef4ff", color: "#2448a7", fontSize: 12 }}>
              当前 Sheet: {preview.currentSheetCount}
            </div>
            <div style={{ padding: "8px 12px", borderRadius: 999, background: "#eefbf2", color: "#1b7f3a", fontSize: 12 }}>
              已匹配: {preview.matchedCount}
            </div>
            <div style={{ padding: "8px 12px", borderRadius: 999, background: "#fff7e8", color: "#a96b00", fontSize: 12 }}>
              缺失: {preview.missingCount}
            </div>
            <div style={{ padding: "8px 12px", borderRadius: 999, background: "#edf4ff", color: "#2457c5", fontSize: 12 }}>
              额外: {preview.extraCount}
            </div>
            <div style={{ padding: "8px 12px", borderRadius: 999, background: "#f4f6fb", color: "#475569", fontSize: 12 }}>
              上传 Sheet: {preview.uploadedSheetCount}
            </div>
          </div>
          {(preview.missingCount > 0 || preview.extraCount > 0) && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#7c5c00", lineHeight: 1.6 }}>
              确认导入后，只会更新已匹配的 sheet。未匹配的当前 sheet 会保留，上传文件里多出的 sheet 会被忽略。
            </div>
          )}
        </div>

        <div style={{ display: "flex", minHeight: 0, flex: 1 }}>
          <div style={{ width: 280, borderRight: "1px solid #e6ebf2", background: "#f8fafc", overflow: "auto" }}>
            {preview.sheets.map((sheet, index) => {
              const badge = statusStyle(sheet.status);
              const selected = index === activeSheetIndex;
              return (
                <button
                  key={sheet.key}
                  onClick={() => onSheetIndexChange(index)}
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    border: "none",
                    borderBottom: "1px solid #e6ebf2",
                    background: selected ? "#fff" : "transparent",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: selected ? 700 : 600, color: "#111827" }}>{sheet.name}</div>
                    <span style={{ fontSize: 11, borderRadius: 999, padding: "3px 8px", background: badge.bg, color: badge.fg }}>
                      {badge.text}
                    </span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>
                    <div>当前 {sheet.currentRows} 行 × {sheet.currentCols} 列</div>
                    <div>导入 {sheet.uploadedRows} 行 × {sheet.uploadedCols} 列</div>
                    <div>新增 {sheet.addedCells}，删除 {sheet.removedCells}，修改 {sheet.changedCells}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ flex: 1, minWidth: 0, padding: 18, overflow: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{activeSheet.name}</div>
                <div style={{ marginTop: 6, fontSize: 13, color: "#6b7280" }}>
                  {activeSheet.status === "matched" && "按 sheet 名匹配后对比当前工作簿与导入文件"}
                  {activeSheet.status === "missing" && "当前工作簿存在该 sheet，但导入文件里没有匹配项"}
                  {activeSheet.status === "extra" && "导入文件里存在该 sheet，但当前工作簿里没有匹配项"}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#475569", textAlign: "right", lineHeight: 1.7 }}>
                <div>新增单元格 {activeSheet.addedCells}</div>
                <div>删除单元格 {activeSheet.removedCells}</div>
                <div>修改单元格 {activeSheet.changedCells}</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
              {renderGrid("当前工作簿", diffState.currentGrid, highlightState.currentHighlights, "current")}
              {renderGrid("导入文件", diffState.uploadedGrid, highlightState.uploadedHighlights, "uploaded")}
            </div>

            {activeSheet.sampleDiffs.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", marginBottom: 8 }}>差异样本</div>
                <div style={{ border: "1px solid #e6ebf2", borderRadius: 10, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", color: "#475569" }}>
                        <th style={{ padding: "8px 10px", textAlign: "left" }}>位置</th>
                        <th style={{ padding: "8px 10px", textAlign: "left" }}>类型</th>
                        <th style={{ padding: "8px 10px", textAlign: "left" }}>当前值</th>
                        <th style={{ padding: "8px 10px", textAlign: "left" }}>导入值</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeSheet.sampleDiffs.slice(0, 12).map((diff, index) => (
                        <tr key={index} style={{ borderTop: "1px solid #edf1f5" }}>
                          <td style={{ padding: "8px 10px" }}>{`${columnLabel(diff.col)}${diff.row + 1}`}</td>
                          <td style={{ padding: "8px 10px" }}>
                            {diff.kind === "added" ? "新增" : diff.kind === "removed" ? "删除" : "修改"}
                          </td>
                          <td style={{ padding: "8px 10px", color: "#b23b3b" }}>{diff.currentValue || "空"}</td>
                          <td style={{ padding: "8px 10px", color: "#1b7f3a" }}>{diff.uploadedValue || "空"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
