import { createChart } from "./createChart.js";
import { deleteChart } from "./deleteChart.js";
import { listCharts } from "./listCharts.js";
import { updateChart } from "./updateChart.js";

export const chartToolManifest = [
  { name: "createChart", tool: createChart },
  { name: "updateChart", tool: updateChart },
  { name: "deleteChart", tool: deleteChart },
  { name: "listCharts", tool: listCharts },
] as const;

export const chartTools = Object.fromEntries(
  chartToolManifest.map(({ name, tool }) => [name, tool]),
) as Record<(typeof chartToolManifest)[number]["name"], (typeof chartToolManifest)[number]["tool"]>;
