import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import {
  resolveWorkbookIdForRequest,
  resolveWorkspaceIdForRequest,
} from "../../../middleware/resourceAccess.js";
import * as application from "../application/index.js";

function sendChartError(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  error: unknown,
) {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: "图表参数无效",
      code: "INVALID_CHART",
      details: error.issues.slice(0, 10),
    });
  }
  if (error instanceof application.ChartValidationError) {
    return reply.status(400).send({
      error: error.message,
      code: "INVALID_CHART",
    });
  }
  if (error instanceof application.ChartMutationNotFoundError) {
    return reply.status(404).send({ error: "Chart not found" });
  }
  return undefined;
}

export async function chartRoutes(app: FastifyInstance) {
  app.get<{
    Params: { workspacePublicId: string; workbookPublicId: string };
  }>(
    "/api/workspaces/:workspacePublicId/workbooks/:workbookPublicId/charts",
    async (req, reply) => {
      const ids = await resolveWorkbookIdForRequest(
        req,
        req.params.workspacePublicId,
        req.params.workbookPublicId,
        reply,
      );
      if (ids == null) return;
      return application.listCharts(ids.workspaceId, ids.workbookId);
    },
  );

  app.post<{
    Params: { workspacePublicId: string; workbookPublicId: string };
    Body: Omit<application.CreateChartInput, "workbookId" | "id"> & { workbookId?: string };
  }>(
    "/api/workspaces/:workspacePublicId/workbooks/:workbookPublicId/charts",
    async (req, reply) => {
      const ids = await resolveWorkbookIdForRequest(
        req,
        req.params.workspacePublicId,
        req.params.workbookPublicId,
        reply,
      );
      if (ids == null) return;

      try {
        const chart = await application.createChartMutation(ids.workspaceId, {
          ...req.body,
          workbookId: String(ids.workbookId),
        });
        if (!chart) return reply.status(404).send({ error: "Workbook not found" });
        return reply.status(201).send(chart);
      } catch (error) {
        const response = sendChartError(reply, error);
        if (response !== undefined) return response;
        throw error;
      }
    },
  );

  app.patch<{
    Params: { workspacePublicId: string; chartId: string };
    Body: application.UpdateChartInput;
  }>("/api/workspaces/:workspacePublicId/charts/:chartId", async (req, reply) => {
    const workspaceId = await resolveWorkspaceIdForRequest(
      req,
      req.params.workspacePublicId,
      reply,
    );
    if (workspaceId == null) return;

    try {
      return await application.updateChartMutation(workspaceId, req.params.chartId, req.body);
    } catch (error) {
      const response = sendChartError(reply, error);
      if (response !== undefined) return response;
      throw error;
    }
  });

  app.delete<{
    Params: { workspacePublicId: string; chartId: string };
  }>("/api/workspaces/:workspacePublicId/charts/:chartId", async (req, reply) => {
    const workspaceId = await resolveWorkspaceIdForRequest(
      req,
      req.params.workspacePublicId,
      reply,
    );
    if (workspaceId == null) return;
    try {
      await application.deleteChartMutation(workspaceId, req.params.chartId);
    } catch (error) {
      const response = sendChartError(reply, error);
      if (response !== undefined) return response;
      throw error;
    }
    return reply.status(204).send();
  });
}
