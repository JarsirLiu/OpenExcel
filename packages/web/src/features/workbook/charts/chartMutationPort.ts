import { createChart, deleteChart, updateChart } from "@/api/charts";
import type { ChartMutationPort } from "./chartMutation";

export const chartMutationPort: ChartMutationPort = {
  create: createChart,
  updateAnchor: (workspaceId, chartId, anchor) => updateChart(workspaceId, chartId, { anchor }),
  remove: deleteChart,
};
