import { defineServerTool } from "../../../shared/tools/serverTool.js";
import { listCharts as listChartsUseCase } from "../application/chartService.js";

export const listCharts = defineServerTool("listCharts", {
  execute: async (input, { context }) => listChartsUseCase(context.workspaceId, input.workbookId),
});
