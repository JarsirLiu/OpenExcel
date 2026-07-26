import { workspaceToolContextSchema } from "../../../shared/tools/context.js";
import { chartListOutputSchema } from "../../../shared/tools/outputSchemas.js";
import { defineServerTool } from "../../../shared/tools/serverTool.js";
import { listCharts as listChartsUseCase } from "../application/chartService.js";

export const listCharts = defineServerTool("listCharts", {
  contextSchema: workspaceToolContextSchema,
  outputSchema: chartListOutputSchema,
  execute: async (input, { context }) => listChartsUseCase(context.workspaceId, input.workbookId),
});
