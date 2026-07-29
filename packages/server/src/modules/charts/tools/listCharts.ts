import { defineServerTool } from "../../../shared/tools/serverTool.js";
import { listChartsPage as listChartsUseCase } from "../application/chartService.js";

export const listCharts = defineServerTool("listCharts", {
  persistenceMode: "read",
  resultBudget: { maxTokens: 8_000, compact: (value) => value },
  execute: async (input, { context }) =>
    listChartsUseCase(context.workspaceId, input.workbookId, {
      offset: input.offset,
      limit: input.limit ?? 50,
    }),
});
