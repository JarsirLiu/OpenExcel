export class SessionBusyError extends Error {
  readonly statusCode = 409;
  readonly code = "SESSION_BUSY";

  constructor() {
    super("上一轮对话仍在处理中，请稍后再发送");
    this.name = "SessionBusyError";
  }
}

export class DraftRequestConflictError extends Error {
  readonly statusCode = 409;
  readonly code = "DRAFT_REQUEST_ALREADY_PROCESSED";

  constructor(readonly sessionId: number) {
    super("这条消息已经提交，请从历史会话继续");
    this.name = "DraftRequestConflictError";
  }
}
