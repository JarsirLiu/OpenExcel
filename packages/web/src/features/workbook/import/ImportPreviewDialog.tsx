import { createPortal } from "react-dom";
import { useMemo } from "react";
import type { WorkbookImportPreview, ImportSheetPreview } from "./importPreview";
import { getCellSignature, makeDisplayGrid } from "./importPreview";
import { t } from "@/lib/i18n";
import styles from "./ImportPreviewDialog.module.css";

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
      return { cls: styles.badgeGreen, text: t("matched", "已匹配") };
    case "missing":
      return { cls: styles.badgeYellow, text: t("missing", "当前缺失") };
    case "extra":
      return { cls: styles.badgePurple, text: t("extra", "文件多出") };
  }
}

function cellStyle(kind: "added" | "removed" | "changed" | undefined) {
  switch (kind) {
    case "added": return { background: "#e9f8ee", color: "#1b7f3a" };
    case "removed": return { background: "#fdeeee", color: "#b23b3b" };
    case "changed": return { background: "#fff3db", color: "#a96b00" };
    default: return { background: "#fff", color: "#1f2a37" };
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
  ) => (
    <div className={styles.gridCol}>
      <div className={styles.gridLabel}>{title}</div>
      <div className={styles.gridBox}>
        <table className={styles.gridTable}>
          <thead>
            <tr>
              <th className={`${styles.gridTh} ${styles.gridThNum}`}>#</th>
              {grid[0]?.map((_, col) => (
                <th key={col} className={styles.gridTh}>{columnLabel(col)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <th className={styles.gridRowNum}>{rowIndex + 1}</th>
                {row.map((cell, colIndex) => {
                  const key = `${rowIndex},${colIndex}`;
                  const kind = highlights.get(key);
                  const cs = cellStyle(kind);
                  return (
                    <td
                      key={colIndex}
                      className={styles.gridCell}
                      style={{ background: cs.background, color: cs.color }}
                      title={cell}
                    >
                      {cell || "\u00A0"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.gridFooter}>
        {title === t("current_workbook", "当前工作簿") ? t("current_side_label", "左侧为当前工作簿数据") : t("uploaded_side_label", "右侧为上传文件数据")}
      </div>
    </div>
  );

  return createPortal(
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget && !confirming) onCancel(); }}>
      <div className={styles.dialog}>
        <div className={styles.dialogHeader}>
          <div className={styles.dialogHeaderRow}>
            <div>
              <div className={styles.dialogTitle}>{t("import_preview", "导入预览")}</div>
              <div className={styles.dialogDesc}>
                {t("import_preview_desc", "当前工作簿「{name}」与文件「{file}」的 sheet 内容对比", { name: preview.workbookName, file: preview.fileName })}
              </div>
            </div>
            <div className={styles.dialogActions}>
              <button onClick={onCancel} disabled={confirming} className={styles.btnCancel}>
                {t("cancel", "取消")}
              </button>
              <button onClick={onConfirm} disabled={confirming} className={styles.btnConfirm}>
                {confirming ? t("importing", "导入中...") : t("confirm_import", "确认导入")}
              </button>
            </div>
          </div>

          <div className={styles.badgeRow}>
            <span className={`${styles.badge} ${styles.badgeBlue}`}>{t("current_sheets", "当前 Sheet")}: {preview.currentSheetCount}</span>
            <span className={`${styles.badge} ${styles.badgeGreen}`}>{t("matched", "已匹配")}: {preview.matchedCount}</span>
            <span className={`${styles.badge} ${styles.badgeYellow}`}>{t("missing", "缺失")}: {preview.missingCount}</span>
            <span className={`${styles.badge} ${styles.badgePurple}`}>{t("extra", "额外")}: {preview.extraCount}</span>
            <span className={`${styles.badge} ${styles.badgeGray}`}>{t("uploaded_sheets", "上传 Sheet")}: {preview.uploadedSheetCount}</span>
          </div>
          {(preview.missingCount > 0 || preview.extraCount > 0) && (
            <div className={styles.warning}>
              {t("import_warning", "确认导入后，只会更新已匹配的 sheet。未匹配的当前 sheet 会保留，上传文件里多出的 sheet 会被忽略。")}
            </div>
          )}
        </div>

        <div className={styles.body}>
          <div className={styles.sidebar}>
            {preview.sheets.map((sheet, index) => {
              const badge = statusStyle(sheet.status);
              const selected = index === activeSheetIndex;
              return (
                <button
                  key={sheet.key}
                  onClick={() => onSheetIndexChange(index)}
                  className={`${styles.sheetBtn} ${selected ? styles.sheetBtnActive : ""}`}
                >
                  <div className={styles.sheetBtnRow}>
                    <div className={`${styles.sheetName} ${selected ? styles.sheetNameActive : styles.sheetNameInactive}`}>
                      {sheet.name}
                    </div>
                    <span className={`${styles.statusPill} ${badge.cls}`}>{badge.text}</span>
                  </div>
                  <div className={styles.sheetStats}>
                    <div>{t("current", "当前")} {sheet.currentRows}行 × {sheet.currentCols}列</div>
                    <div>{t("import", "导入")} {sheet.uploadedRows}行 × {sheet.uploadedCols}列</div>
                    <div>{t("added", "新增")} {sheet.addedCells}，{t("removed", "删除")} {sheet.removedCells}，{t("changed", "修改")} {sheet.changedCells}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className={styles.content}>
            <div className={styles.contentHeader}>
              <div>
                <div className={styles.contentSheetName}>{activeSheet.name}</div>
                <div className={styles.contentSheetDesc}>
                  {activeSheet.status === "matched" && t("sheet_matched_desc", "按 sheet 名匹配后对比当前工作簿与导入文件")}
                  {activeSheet.status === "missing" && t("sheet_missing_desc", "当前工作簿存在该 sheet，但导入文件里没有匹配项")}
                  {activeSheet.status === "extra" && t("sheet_extra_desc", "导入文件里存在该 sheet，但当前工作簿里没有匹配项")}
                </div>
              </div>
              <div className={styles.contentStats}>
                <div>{t("added_cells", "新增单元格")} {activeSheet.addedCells}</div>
                <div>{t("removed_cells", "删除单元格")} {activeSheet.removedCells}</div>
                <div>{t("changed_cells", "修改单元格")} {activeSheet.changedCells}</div>
              </div>
            </div>

            <div className={styles.gridWrap}>
              {renderGrid(t("current_workbook", "当前工作簿"), diffState.currentGrid, highlightState.currentHighlights)}
              {renderGrid(t("uploaded_file", "导入文件"), diffState.uploadedGrid, highlightState.uploadedHighlights)}
            </div>

            {activeSheet.sampleDiffs.length > 0 && (
              <div className={styles.diffSection}>
                <div className={styles.diffTitle}>{t("diff_samples", "差异样本")}</div>
                <div className={styles.diffBox}>
                  <table className={styles.diffTable}>
                    <thead>
                      <tr>
                        <th className={styles.diffTh}>{t("position", "位置")}</th>
                        <th className={styles.diffTh}>{t("type", "类型")}</th>
                        <th className={styles.diffTh}>{t("current_value", "当前值")}</th>
                        <th className={styles.diffTh}>{t("imported_value", "导入值")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeSheet.sampleDiffs.slice(0, 12).map((diff, index) => (
                        <tr key={index} className={styles.diffRow}>
                          <td className={styles.diffTd}>{`${columnLabel(diff.col)}${diff.row + 1}`}</td>
                          <td className={styles.diffTd}>
                            {diff.kind === "added" ? t("added", "新增") : diff.kind === "removed" ? t("removed", "删除") : t("changed", "修改")}
                          </td>
                          <td className={`${styles.diffTd} ${styles.diffValueRed}`}>{diff.currentValue || t("empty", "空")}</td>
                          <td className={`${styles.diffTd} ${styles.diffValueGreen}`}>{diff.uploadedValue || t("empty", "空")}</td>
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