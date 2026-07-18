import type { ChartSpec } from "@openexcel/core";
import { useEffect, useState } from "react";
import styles from "./ChartInsertDialog.module.css";
import type { ChartSelection } from "./chartSelection";
import { buildChartDraft, chartSelectionSize } from "./chartSelection";

type Props = {
  open: boolean;
  workbookId: number;
  sheetId: number;
  sheetName: string;
  selection: ChartSelection | null;
  onClose: () => void;
  onCreate: (draft: Omit<ChartSpec, "id">) => Promise<void>;
};

const chartTypes: { value: ChartSpec["type"]; label: string }[] = [
  { value: "bar", label: "柱形图" },
  { value: "line", label: "折线图" },
  { value: "area", label: "面积图" },
  { value: "pie", label: "饼图" },
  { value: "scatter", label: "散点图" },
];

export function ChartInsertDialog({
  open,
  workbookId,
  sheetId,
  sheetName,
  selection,
  onClose,
  onCreate,
}: Props) {
  const [type, setType] = useState<ChartSpec["type"]>("bar");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  if (!open) return null;

  const size = chartSelectionSize(selection);
  const hasValidSelection = selection != null;
  const hasEnoughSeries = size.columns >= 2 && size.rows >= 2;
  const isPieSelection = type !== "pie" || size.columns === 2;

  const submit = async () => {
    if (!selection) {
      setError("请先在表格中选择包含标题行和分类列的数据区域");
      return;
    }
    if (!hasEnoughSeries) {
      setError("数据区域至少需要两行两列");
      return;
    }
    if (!isPieSelection) {
      setError("饼图只能使用一列数值系列，请缩小选区");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onCreate(buildChartDraft({ workbookId, sheetId, selection, type, title }));
      setTitle("");
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建图表失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={onClose}>
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="chart-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id="chart-dialog-title">插入图表</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className={styles.body}>
          <p className={styles.reference}>
            {sheetName} ·{" "}
            {hasValidSelection ? `${size.rows} 行 × ${size.columns} 列` : "未选择数据区域"}
          </p>
          <label className={styles.field}>
            <span>图表类型</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value as ChartSpec["type"])}
            >
              {chartTypes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>标题</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="可选"
            />
          </label>
          {error ? <p className={styles.error}>{error}</p> : null}
        </div>
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.secondary}
            onClick={onClose}
            disabled={submitting}
          >
            取消
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={() => void submit()}
            disabled={submitting}
          >
            {submitting ? "创建中..." : "创建图表"}
          </button>
        </div>
      </section>
    </div>
  );
}
