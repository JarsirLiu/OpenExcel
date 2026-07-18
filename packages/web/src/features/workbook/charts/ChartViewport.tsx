import type { ChartSpec } from "@openexcel/core";
import type { WorkbookFull } from "@/api/workbooks";
import { ChartRenderer } from "./ChartRenderer";
import styles from "./ChartViewport.module.css";

interface Props {
  workbook: WorkbookFull;
  sheetId: number;
}

export function ChartViewport({ workbook, sheetId }: Props) {
  const charts = workbook.charts.filter((chart: ChartSpec) => chart.sheetId === String(sheetId));
  if (charts.length === 0) return null;

  return (
    <section className={styles.container} aria-label="当前工作表图表">
      <div className={styles.header}>
        <h2>图表</h2>
        <span>{charts.length}</span>
      </div>
      <div className={styles.grid}>
        {charts.map((chart) => (
          <article className={styles.item} key={chart.id}>
            <ChartRenderer chart={chart} sheets={workbook.sheets} />
          </article>
        ))}
      </div>
    </section>
  );
}
