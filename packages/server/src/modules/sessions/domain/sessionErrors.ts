export class SessionBusyError extends Error {
  readonly statusCode = 409;
  readonly code = "SESSION_BUSY";

  constructor() {
    super("上一轮对话仍在处理中，请稍后再发送");
    this.name = "SessionBusyError";
  }
}
