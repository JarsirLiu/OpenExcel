import { formatAIError } from "@openexcel/agent";
import { pipeUIMessageStreamToResponse } from "ai";
import type { FastifyInstance } from "fastify";
import {
  resolveSessionIdForRequest,
  resolveWorkspaceIdForRequest,
} from "../../../middleware/resourceAccess.js";
import * as application from "../application/index.js";
import { DraftRequestConflictError, SessionBusyError } from "../domain/sessionErrors.js";

function isDatabaseError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code : "";
  const message = error instanceof Error ? error.message : String(record.message ?? "");
  return (
    code === "P1008" ||
    /database failed to respond|database is locked|database is busy|socket timeout/i.test(message)
  );
}

function isUndoConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /没有可撤销|无法撤销|当前运行已失效|会话记录与运行输入不一致|运行记录中的 .* 输出损坏|会话消息记录损坏/.test(
    message,
  );
}

export async function sessionRoutes(app: FastifyInstance) {
  app.get<{ Params: { workspacePublicId: string } }>(
    "/api/workspaces/:workspacePublicId/sessions",
    async (req, reply) => {
      const workspaceId = await resolveWorkspaceIdForRequest(
        req,
        req.params.workspacePublicId,
        reply,
      );
      if (workspaceId == null) return;
      return application.getSessions(workspaceId);
    },
  );

  app.post<{
    Params: { workspacePublicId: string };
    Body: { messages: any[] };
  }>("/api/workspaces/:workspacePublicId/sessions/draft/chat", async (req, reply) => {
    const workspaceId = await resolveWorkspaceIdForRequest(
      req,
      req.params.workspacePublicId,
      reply,
    );
    if (workspaceId == null) return;

    const { messages } = req.body;
    const clientRequestId = req.headers["idempotency-key"];
    const normalizedClientRequestId = Array.isArray(clientRequestId)
      ? clientRequestId[0]
      : clientRequestId;
    const controller = new AbortController();
    const abort = () => {
      if (!controller.signal.aborted) controller.abort();
    };

    req.raw.on("aborted", abort);
    reply.raw.on("close", () => {
      if (!reply.raw.writableEnded) abort();
    });

    let sessionId: number | null = null;
    try {
      const result = await application.startDraftChat(workspaceId, messages, {
        abortSignal: controller.signal,
        clientRequestId: normalizedClientRequestId,
      });
      sessionId = result.session.id;

      if (controller.signal.aborted) {
        await application.deleteSession(workspaceId, sessionId);
        return;
      }

      // The stream is written directly to the raw response after hijacking;
      // Fastify reply headers would otherwise be skipped.
      reply.raw.setHeader("X-OpenExcel-Session-Id", String(sessionId));
      reply.raw.setHeader("X-OpenExcel-Session-Name", encodeURIComponent(result.session.name));
      reply.hijack();
      pipeUIMessageStreamToResponse({ response: reply.raw, stream: result.stream });
    } catch (error) {
      if (controller.signal.aborted) {
        if (sessionId != null) await application.deleteSession(workspaceId, sessionId);
        return;
      }
      if (error instanceof SessionBusyError) {
        return reply.status(error.statusCode).send({ error: error.message });
      }
      if (error instanceof DraftRequestConflictError) {
        reply.header("X-OpenExcel-Session-Id", String(error.sessionId));
        return reply.status(error.statusCode).send({ error: error.message });
      }
      const errorMessage = isDatabaseError(error) ? "数据库繁忙，请稍后重试" : formatAIError(error);
      console.error(`[session] Failed to start draft chat: ${errorMessage}`);
      if (!reply.sent) return reply.status(502).send({ error: errorMessage });
    }
  });

  app.delete<{ Params: { workspacePublicId: string; sessionPublicId: string } }>(
    "/api/workspaces/:workspacePublicId/sessions/:sessionPublicId",
    async (req, reply) => {
      const ids = await resolveSessionIdForRequest(
        req,
        req.params.workspacePublicId,
        req.params.sessionPublicId,
        reply,
      );
      if (ids == null) return;
      const deleted = await application.deleteSession(ids.workspaceId, ids.sessionId);
      if (!deleted) return reply.status(404).send({ error: "Session not found" });
      return { success: true };
    },
  );

  app.patch<{
    Params: { workspacePublicId: string; sessionPublicId: string };
    Body: { name: string };
  }>("/api/workspaces/:workspacePublicId/sessions/:sessionPublicId", async (req, reply) => {
    const ids = await resolveSessionIdForRequest(
      req,
      req.params.workspacePublicId,
      req.params.sessionPublicId,
      reply,
    );
    if (ids == null) return;
    const session = await application.renameSession(ids.workspaceId, ids.sessionId, req.body.name);
    if (!session) return reply.status(404).send({ error: "Session not found" });
    return session;
  });

  app.get<{
    Params: { workspacePublicId: string; sessionPublicId: string };
    Querystring: { limit?: string; offset?: string };
  }>(
    "/api/workspaces/:workspacePublicId/sessions/:sessionPublicId/messages",
    async (req, reply) => {
      const ids = await resolveSessionIdForRequest(
        req,
        req.params.workspacePublicId,
        req.params.sessionPublicId,
        reply,
      );
      if (ids == null) return;
      const session = await application.getSession(ids.workspaceId, ids.sessionId);
      if (!session) return reply.status(404).send({ error: "Session not found" });
      const limit = Math.min(Number(req.query.limit) || 40, 200);
      const offset = Number(req.query.offset) || 0;
      return application.getMessages(ids.workspaceId, ids.sessionId, limit, offset);
    },
  );

  app.get<{ Params: { workspacePublicId: string; sessionPublicId: string } }>(
    "/api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs",
    async (req, reply) => {
      const ids = await resolveSessionIdForRequest(
        req,
        req.params.workspacePublicId,
        req.params.sessionPublicId,
        reply,
      );
      if (ids == null) return;
      const session = await application.getSession(ids.workspaceId, ids.sessionId);
      if (!session) return reply.status(404).send({ error: "Session not found" });
      return application.getRuns(ids.workspaceId, ids.sessionId);
    },
  );

  app.post<{ Params: { workspacePublicId: string; sessionPublicId: string } }>(
    "/api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs/undo-latest",
    async (req, reply) => {
      const ids = await resolveSessionIdForRequest(
        req,
        req.params.workspacePublicId,
        req.params.sessionPublicId,
        reply,
      );
      if (ids == null) return;
      const session = await application.getSession(ids.workspaceId, ids.sessionId);
      if (!session) return reply.status(404).send({ error: "Session not found" });
      try {
        return await application.undoLatestRun(ids.workspaceId, ids.sessionId);
      } catch (error) {
        if (isUndoConflict(error)) {
          const message = error instanceof Error ? error.message : "当前运行无法撤销";
          return reply.status(409).send({ error: message });
        }
        throw error;
      }
    },
  );

  app.post<{
    Params: { workspacePublicId: string; sessionPublicId: string };
    Body: { firstUserText: string };
  }>("/api/workspaces/:workspacePublicId/sessions/:sessionPublicId/title", async (req, reply) => {
    const ids = await resolveSessionIdForRequest(
      req,
      req.params.workspacePublicId,
      req.params.sessionPublicId,
      reply,
    );
    if (ids == null) return;
    const sessionId = ids.sessionId;
    const firstUserText =
      typeof req.body?.firstUserText === "string" ? req.body.firstUserText.trim() : "";

    if (!firstUserText) {
      return reply.status(400).send({ error: "标题生成需要用户消息" });
    }

    const session = await application.getSession(ids.workspaceId, sessionId);
    if (!session) {
      return reply.status(404).send({ error: "会话不存在" });
    }

    const title = await application.generateSessionTitleForSession(
      ids.workspaceId,
      sessionId,
      firstUserText,
    );
    return { title };
  });

  app.post<{
    Params: { workspacePublicId: string; sessionPublicId: string };
    Body: { messages: any[] };
  }>("/api/workspaces/:workspacePublicId/sessions/:sessionPublicId/chat", async (req, reply) => {
    const ids = await resolveSessionIdForRequest(
      req,
      req.params.workspacePublicId,
      req.params.sessionPublicId,
      reply,
    );
    if (ids == null) return;
    const sessionId = ids.sessionId;
    const session = await application.getSession(ids.workspaceId, sessionId);
    if (!session) return reply.status(404).send({ error: "Session not found" });
    const { messages } = req.body;
    const controller = new AbortController();

    const abort = () => {
      if (!controller.signal.aborted) controller.abort();
    };

    req.raw.on("aborted", abort);
    reply.raw.on("close", () => {
      if (!reply.raw.writableEnded) {
        abort();
      }
    });

    try {
      const stream = await application.streamChat(
        ids.workspaceId,
        sessionId,
        messages,
        controller.signal,
      );

      if (controller.signal.aborted) return;
      reply.hijack();
      pipeUIMessageStreamToResponse({ response: reply.raw, stream });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof SessionBusyError) {
        return reply.status(error.statusCode).send({ error: error.message });
      }
      const errorMessage = isDatabaseError(error) ? "数据库繁忙，请稍后重试" : formatAIError(error);
      console.error(
        `[session] Failed to start chat stream for session ${sessionId}: ${errorMessage}`,
      );
      if (!reply.sent) {
        return reply.status(502).send({ error: errorMessage });
      }
    }
  });
}
