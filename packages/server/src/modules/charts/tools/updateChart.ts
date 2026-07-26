import { defineServerTool } from "../../../shared/tools/serverTool.js";
import { updateChartMutation } from "../application/chartMutationService.js";
import { toUpdateChartPatch } from "./chartToolInput.js";
import { toUpdateChartToolResult } from "./chartToolResult.js";

export const updateChart = defineServerTool("updateChart", {
  execute: async (input, { context, db, toolCallId }) => {
    const result = await updateChartMutation(
      context.workspaceId,
      input.chartId,
      toUpdateChartPatch(input.patch),
      {
        runId: context.runId,
        db,
        mutationId: `ai:${context.runId}:${toolCallId}`,
        commandHash: JSON.stringify(input),
      },
    );
    return toUpdateChartToolResult(result, input.chartId);
  },
});
