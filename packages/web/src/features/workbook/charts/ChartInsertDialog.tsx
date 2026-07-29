import type { ChartSpec } from "@openexcel/core";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/locales/en-US";
import { ChartIcon } from "./ChartIcon";
import styles from "./ChartInsertDialog.module.css";
import type { ChartSelection, ChartSelectionError } from "./chartSelection";
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

const chartTypes: { value: ChartSpec["type"]; labelKey: TranslationKey }[] = [
  { value: "bar", labelKey: "chart_type_bar" },
  { value: "line", labelKey: "chart_type_line" },
  { value: "area", labelKey: "chart_type_area" },
  { value: "pie", labelKey: "chart_type_pie" },
  { value: "doughnut", labelKey: "chart_type_doughnut" },
  { value: "scatter", labelKey: "chart_type_scatter" },
  { value: "radar", labelKey: "chart_type_radar" },
];

function selectionErrorMessage(
  error: ChartSelectionError,
  translate: (key: TranslationKey) => string,
): string {
  if (error === "pieDataRange") return translate("chart_pie_data_error");
  if (error === "scatterDataRange") return translate("chart_scatter_data_error");
  return translate("chart_select_data_error");
}

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

  if (type === "doughnut") {
    return (
      <svg aria-hidden="true" viewBox="0 0 28 24" fill="none">
        <circle cx="14" cy="12" r="8" stroke="currentColor" strokeWidth="4" opacity=".75" />
        <path d="M14 4a8 8 0 0 1 7.2 4.5" stroke="currentColor" strokeWidth="4" />
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

  if (type === "radar") {
    return (
      <svg aria-hidden="true" viewBox="0 0 28 24" fill="none">
        <path d="m14 3 8 6-3 10H9L6 9l8-6Z" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="m14 7 4 3-1.5 5h-5L10 10l4-3Z"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity=".7"
        />
        <path
          d="M14 3v4M6 9l4 1M22 9l-4 1M9 19l2.5-4M19 19l-2.5-4"
          stroke="currentColor"
          strokeWidth="1.2"
        />
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
  const { t } = useI18n();
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
      setError(selectionErrorMessage(selectionError, t));
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
      setError(cause instanceof Error ? cause.message : t("chart_create_failed"));
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
              <h2 id="chart-dialog-title">{t("chart_insert_title")}</h2>
              <p>{t("chart_insert_description")}</p>
            </div>
          </div>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label={t("chart_close")}
          >
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
              <strong>{t("chart_data_region")}</strong>
              <span>
                {sheetName} ·{" "}
                {hasValidSelection ? `${size.rows} × ${size.columns}` : t("chart_not_selected")}
              </span>
            </div>
            <span className={styles.selectionStatus}>
              {hasValidSelection ? t("chart_selected") : t("chart_not_selected")}
            </span>
          </div>
          <fieldset className={styles.typeGroup}>
            <legend>{t("chart_type_label")}</legend>
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
                  <span>{t(item.labelKey)}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <label className={styles.field}>
            <span>{t("chart_title_label")}</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("chart_optional_title")}
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
            {t("cancel")}
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={() => void submit()}
            disabled={submitting}
            aria-label={t("chart_create")}
          >
            {submitting ? t("chart_creating") : t("chart_create")}
          </button>
        </div>
      </section>
    </div>
  );
}
