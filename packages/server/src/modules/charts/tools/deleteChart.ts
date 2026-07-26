import { defineServerTool } from "../../../shared/tools/serverTool.js";
import { deleteChartMutation } from "../application/chartMutationService.js";

export const deleteChart = defineServerTool("deleteChart", {
  execute: async (input, { context, db, toolCallId }) => {
    const result = await deleteChartMutation(context.workspaceId, input.chartId, {
      runId: context.runId,
      db,
      mutationId: `ai:${context.runId}:${toolCallId}`,
      commandHash: JSON.stringify(input),
    });
    if (!result) throw new Error(`Chart ${input.chartId} 不存在`);
    return { success: true as const, chartId: input.chartId };
  },
});
