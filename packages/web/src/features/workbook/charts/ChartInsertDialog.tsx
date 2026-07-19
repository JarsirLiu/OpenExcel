import type { ChartSpec } from "@openexcel/core";
import { useEffect, useState } from "react";
import { ChartIcon } from "./ChartIcon";
import styles from "./ChartInsertDialog.module.css";
import type { ChartSelection } from "./chartSelection";
import { buildChartDraft, chartSelectionError, chartSelectionSize } from "./chartSelection";

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

function ChartTypeIcon({ type }: { type: ChartSpec["type"] }) {
  if (type === "line" || type === "area") {
    return (
      <svg aria-hidden="true" viewBox="0 0 28 24" fill="none">
        {type === "area" ? (
          <path d="M3 19 9 12l5 3 7-9 4 13H3Z" fill="currentColor" opacity=".16" />
        ) : null}
        <path
          d="m3 19 6-7 5 3 7-9 4 13"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="9" cy="12" r="1.5" fill="currentColor" />
        <circle cx="14" cy="15" r="1.5" fill="currentColor" />
        <circle cx="21" cy="6" r="1.5" fill="currentColor" />
      </svg>
    );
  }

  if (type === "pie") {
    return (
      <svg aria-hidden="true" viewBox="0 0 28 24" fill="none">
        <path d="M14 3a9 9 0 1 0 8.5 12H14V3Z" fill="currentColor" opacity=".18" />
        <path d="M16 3a9 9 0 0 1 8 8h-8V3Z" fill="currentColor" opacity=".7" />
        <path d="M14 3a9 9 0 1 0 8.5 12H14V3Z" stroke="currentColor" strokeWidth="1.6" />
        <path d="M16 3a9 9 0 0 1 8 8h-8V3Z" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }

  if (type === "scatter") {
    return (
      <svg aria-hidden="true" viewBox="0 0 28 24" fill="none">
        <path d="M4 20h20M5 19V4" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="9" cy="15" r="2" fill="currentColor" />
        <circle cx="13" cy="10" r="2" fill="currentColor" opacity=".75" />
        <circle cx="19" cy="13" r="2" fill="currentColor" />
        <circle cx="22" cy="6" r="2" fill="currentColor" opacity=".75" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 28 24" fill="none">
      <path d="M4 20h20M5 19V4" stroke="currentColor" strokeWidth="1.5" />
      <rect x="8" y="12" width="3.5" height="6" rx=".7" fill="currentColor" opacity=".65" />
      <rect x="13.5" y="8" width="3.5" height="10" rx=".7" fill="currentColor" />
      <rect x="19" y="5" width="3.5" height="13" rx=".7" fill="currentColor" opacity=".8" />
    </svg>
  );
}

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

  const submit = async () => {
    const selectionError = chartSelectionError(selection, type);
    if (selectionError) {
      setError(selectionError);
      return;
    }
    if (!selection) return;

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
          <div className={styles.heading}>
            <span className={styles.headingIcon}>
              <ChartIcon />
            </span>
            <div>
              <h2 id="chart-dialog-title">插入图表</h2>
              <p>根据单行、单列或二维选区生成可编辑图表</p>
            </div>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className={styles.body}>
          <div
            className={`${styles.selectionCard} ${hasValidSelection ? "" : styles.selectionEmpty}`}
          >
            <div className={styles.selectionIcon}>
              <span />
              <span />
              <span />
            </div>
            <div className={styles.selectionContent}>
              <strong>数据区域</strong>
              <span>
                {sheetName} ·{" "}
                {hasValidSelection ? `${size.rows} 行 × ${size.columns} 列` : "未选择"}
              </span>
            </div>
            <span className={styles.selectionStatus}>
              {hasValidSelection ? "已选中" : "待选择"}
            </span>
          </div>
          <fieldset className={styles.typeGroup}>
            <legend>图表类型</legend>
            <div className={styles.typeGrid}>
              {chartTypes.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`${styles.typeOption} ${type === item.value ? styles.typeOptionActive : ""}`}
                  onClick={() => setType(item.value)}
                  aria-pressed={type === item.value}
                >
                  <span className={styles.typeIcon}>
                    <ChartTypeIcon type={item.value} />
                  </span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </fieldset>
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
            aria-label="确认创建图表"
          >
            {submitting ? "生成中..." : "确认生成图表"}
          </button>
        </div>
      </section>
    </div>
  );
}
