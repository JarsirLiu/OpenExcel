import { excelToolSpecs, workspaceToolContextSchema } from "@openexcel/agent";
import { listCharts as listChartsUseCase } from "../application/chartService.js";

export const listCharts = {
  ...excelToolSpecs.listCharts,
  contextSchema: workspaceToolContextSchema,
  execute: async (
    input: { workbookId: number },
    { context }: { context: { workspaceId: number } },
  ) => listChartsUseCase(context.workspaceId, input.workbookId),
};
