import type { ServerToolDefinition } from "../../../shared/tools/serverTool.js";
import { createChart } from "./createChart.js";
import { deleteChart } from "./deleteChart.js";
import { listCharts } from "./listCharts.js";
import { updateChart } from "./updateChart.js";

export const chartToolManifest = [
  createChart,
  updateChart,
  deleteChart,
  listCharts,
] as const satisfies readonly ServerToolDefinition[];
