import { defineServerTool } from "../../../shared/tools/serverTool.js";
import { createChartMutation } from "../application/chartMutationService.js";
import { buildChartSpec } from "../application/chartService.js";
import { toCreateChartSpec } from "./chartToolInput.js";
import { toCreateChartToolResult } from "./chartToolResult.js";

export const createChart = defineServerTool("createChart", {
  execute: async (input, { context, db, toolCallId }) => {
    const spec = buildChartSpec(toCreateChartSpec(input));
    const result = await createChartMutation(context.workspaceId, spec, {
      runId: context.runId,
      db,
      mutationId: `ai:${context.runId}:${toolCallId}`,
      commandHash: JSON.stringify(input),
    });
    return toCreateChartToolResult(result);
  },
});
