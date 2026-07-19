import type { ChartSpec } from "@openexcel/core";
import { BarChart, LineChart, PieChart, ScatterChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components";
import { init, use } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import type { SheetSchema } from "@/api/workbooks";
import styles from "./ChartRenderer.module.css";
import { buildChartRenderData } from "./chartData";

use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
]);

import { buildChartOption } from "./chartOption";

interface Props {
  chart: ChartSpec;
  sheets: readonly SheetSchema[];
}

export function ChartRenderer({ chart, sheets }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    const data = buildChartRenderData(chart, sheets);
    if (!data) return;

    const instance = init(rootRef.current);
    instance.setOption(buildChartOption(chart, data), true);
    const resizeObserver = new ResizeObserver(() => instance.resize());
    resizeObserver.observe(rootRef.current);

    return () => {
      resizeObserver.disconnect();
      instance.dispose();
    };
  }, [chart, sheets]);

  return <div ref={rootRef} className={styles.renderer} />;
}
