import { defineServerTool } from "../../../shared/tools/serverTool.js";
import { createChartMutation } from "../application/chartMutationService.js";
import { toCreateChartSpec } from "./chartToolInput.js";
import { toCreateChartToolResult } from "./chartToolResult.js";

export const createChart = defineServerTool("createChart", {
  execute: async (input, { context, db, toolCallId }) => {
    const result = await createChartMutation(context.workspaceId, toCreateChartSpec(input), {
      runId: context.runId,
      db,
      mutationId: `ai:${context.runId}:${toolCallId}`,
      commandHash: JSON.stringify(input),
    });
    return toCreateChartToolResult(result);
  },
});
