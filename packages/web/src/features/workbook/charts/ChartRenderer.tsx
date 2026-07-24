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
  const instanceRef = useRef<ReturnType<typeof init> | null>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    const instance = init(rootRef.current);
    instanceRef.current = instance;
    const resizeObserver = new ResizeObserver(() => instance.resize());
    resizeObserver.observe(rootRef.current);

    return () => {
      resizeObserver.disconnect();
      instance.dispose();
      instanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    const data = buildChartRenderData(chart, sheets);
    if (!data) {
      instance.clear();
      return;
    }
    instance.setOption(buildChartOption(chart, data), true);
  }, [chart, sheets]);

  return <div ref={rootRef} className={styles.renderer} />;
}
