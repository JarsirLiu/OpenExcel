import { formatAIError } from "@openexcel/agent";
import { consumeStream, pipeUIMessageStreamToResponse } from "ai";
import type { FastifyInstance } from "fastify";
import {
  resolveSessionIdForRequest,
  resolveWorkspaceIdForRequest,
} from "../../../middleware/resourceAccess.js";
import { SheetRevisionConflictError } from "../../sheets/domain/errors.js";
import { type ChatTurnRequest, parseChatTurnRequest } from "../application/chatTurn.js";
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
  if (error instanceof SheetRevisionConflictError) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /没有可撤销|无法撤销|当前运行已失效|会话记录与运行输入不一致|运行记录中的 .* 输出损坏|会话消息记录损坏/.test(
    message,
  );
}

function parseRunId(value: string): number | null {
  const runId = Number(value);
  return Number.isInteger(runId) && runId > 0 ? runId : null;
}

function parseEventCursor(value: string | undefined): number | null {
  if (value == null || value === "") return -1;
  const cursor = Number(value);
  return Number.isInteger(cursor) && cursor >= -1 ? cursor : null;
}

function parseEventLimit(value: string | undefined): number | null {
  if (value == null || value === "") return 200;
  const limit = Number(value);
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, 500) : null;
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
    Body: unknown;
  }>("/api/workspaces/:workspacePublicId/sessions/draft/chat", async (req, reply) => {
    const workspaceId = await resolveWorkspaceIdForRequest(
      req,
      req.params.workspacePublicId,
      reply,
    );
    if (workspaceId == null) return;

    let turn: ChatTurnRequest;
    try {
      turn = parseChatTurnRequest(req.body);
    } catch {
      return reply.status(400).send({ error: "聊天请求格式无效" });
    }
    try {
      const result = await application.startDraftChat(workspaceId, turn);

      // The stream is written directly to the raw response after hijacking;
      // Fastify reply headers would otherwise be skipped.
      reply.raw.setHeader("X-OpenExcel-Session-Id", String(result.session.id));
      reply.raw.setHeader("X-OpenExcel-Session-Name", encodeURIComponent(result.session.name));
      reply.raw.setHeader("X-OpenExcel-Run-Id", String(result.runId));
      reply.hijack();
      pipeUIMessageStreamToResponse({
        response: reply.raw,
        stream: result.stream,
        consumeSseStream: consumeStream,
      });
    } catch (error) {
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

  app.get<{
    Params: { workspacePublicId: string; sessionPublicId: string };
    Querystring: { status?: string };
  }>("/api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs", async (req, reply) => {
    const ids = await resolveSessionIdForRequest(
      req,
      req.params.workspacePublicId,
      req.params.sessionPublicId,
      reply,
    );
    if (ids == null) return;
    const session = await application.getSession(ids.workspaceId, ids.sessionId);
    if (!session) return reply.status(404).send({ error: "Session not found" });
    if (req.query.status != null && req.query.status !== "recovery_required") {
      return reply.status(400).send({ error: "运行状态无效" });
    }
    return req.query.status === "recovery_required"
      ? application.getRecoveryRuns(ids.workspaceId, ids.sessionId)
      : application.getRuns(ids.workspaceId, ids.sessionId);
  });

  app.get<{
    Params: { workspacePublicId: string; sessionPublicId: string; runId: string };
  }>(
    "/api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs/:runId",
    async (req, reply) => {
      const ids = await resolveSessionIdForRequest(
        req,
        req.params.workspacePublicId,
        req.params.sessionPublicId,
        reply,
      );
      if (ids == null) return;

      const runId = parseRunId(req.params.runId);
      if (runId == null) return reply.status(400).send({ error: "运行 ID 无效" });

      const run = await application.getRunReplaySnapshot(ids.workspaceId, ids.sessionId, runId);
      if (!run) return reply.status(404).send({ error: "Run not found" });
      return run;
    },
  );

  app.get<{
    Params: { workspacePublicId: string; sessionPublicId: string; runId: string };
    Querystring: { after?: string; limit?: string };
  }>(
    "/api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs/:runId/events",
    async (req, reply) => {
      const ids = await resolveSessionIdForRequest(
        req,
        req.params.workspacePublicId,
        req.params.sessionPublicId,
        reply,
      );
      if (ids == null) return;

      const runId = parseRunId(req.params.runId);
      if (runId == null) return reply.status(400).send({ error: "运行 ID 无效" });
      const afterSequence = parseEventCursor(req.query.after);
      if (afterSequence == null) return reply.status(400).send({ error: "事件游标无效" });
      const limit = parseEventLimit(req.query.limit);
      if (limit == null) return reply.status(400).send({ error: "事件数量无效" });

      const page = await application.getRunEventPage({
        workspaceId: ids.workspaceId,
        sessionId: ids.sessionId,
        runId,
        afterSequence,
        limit,
      });
      if (!page) return reply.status(404).send({ error: "Run not found" });
      return page;
    },
  );

  app.post<{
    Params: { workspacePublicId: string; sessionPublicId: string; runId: string };
  }>(
    "/api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs/:runId/cancel",
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

      const runId = Number(req.params.runId);
      if (!Number.isInteger(runId) || runId <= 0) {
        return reply.status(400).send({ error: "运行 ID 无效" });
      }

      const result = await application.cancelRun(ids.workspaceId, ids.sessionId, runId);
      if (!result) return reply.status(404).send({ error: "Run not found" });
      return result;
    },
  );

  app.post<{
    Params: { workspacePublicId: string; sessionPublicId: string; runId: string };
  }>(
    "/api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs/:runId/recover",
    async (req, reply) => {
      const ids = await resolveSessionIdForRequest(
        req,
        req.params.workspacePublicId,
        req.params.sessionPublicId,
        reply,
      );
      if (ids == null) return;
      const runId = parseRunId(req.params.runId);
      if (runId == null) return reply.status(400).send({ error: "运行 ID 无效" });

      const result = await application.recoverRun(ids.workspaceId, ids.sessionId, runId);
      if (!result) return reply.status(404).send({ error: "Run not found" });
      if (!result.canAutoRecover) return reply.status(409).send(result);
      return result;
    },
  );

  app.delete<{
    Params: { workspacePublicId: string; sessionPublicId: string; runId: string };
  }>(
    "/api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs/:runId",
    async (req, reply) => {
      const ids = await resolveSessionIdForRequest(
        req,
        req.params.workspacePublicId,
        req.params.sessionPublicId,
        reply,
      );
      if (ids == null) return;
      const runId = parseRunId(req.params.runId);
      if (runId == null) return reply.status(400).send({ error: "运行 ID 无效" });

      const result = await application.abandonRun(ids.workspaceId, ids.sessionId, runId);
      if (!result) return reply.status(404).send({ error: "Run not found" });
      return result;
    },
  );

  app.get<{ Params: { workspacePublicId: string; sessionPublicId: string } }>(
    "/api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs/undo-availability",
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
      return application.getUndoAvailability(ids.workspaceId, ids.sessionId);
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
    Body: unknown;
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
    let turn: ChatTurnRequest;
    try {
      turn = parseChatTurnRequest(req.body);
    } catch {
      return reply.status(400).send({ error: "聊天请求格式无效" });
    }
    try {
      const result = await application.streamChat(ids.workspaceId, sessionId, turn);
      reply.raw.setHeader("X-OpenExcel-Run-Id", String(result.runId));
      reply.hijack();
      pipeUIMessageStreamToResponse({
        response: reply.raw,
        stream: result.stream,
        consumeSseStream: consumeStream,
      });
    } catch (error) {
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
