type ErrorRecord = Record<string, unknown>;
const MAX_ERROR_MESSAGE_LENGTH = 240;

function isRecord(value: unknown): value is ErrorRecord {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function truncate(value: string): string {
  return value.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${value.slice(0, MAX_ERROR_MESSAGE_LENGTH - 1)}...`
    : value;
}

function getNestedError(error: unknown): unknown {
  if (!isRecord(error)) return undefined;
  if (Array.isArray(error.errors) && error.errors.length > 0) {
    return error.errors[error.errors.length - 1];
  }
  if ("lastError" in error) return error.lastError;
  if ("cause" in error) return error.cause;
  return undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error)) {
    return getString(error.message) ?? getString(error.error) ?? "模型服务请求失败";
  }
  return getString(String(error)) ?? "模型服务请求失败";
}

function getResponseMessage(error: unknown): string | undefined {
  if (!isRecord(error)) return undefined;

  const responseBody = getString(error.responseBody);
  if (responseBody) {
    try {
      const parsed: unknown = JSON.parse(responseBody);
      if (isRecord(parsed)) {
        const nestedError = isRecord(parsed.error) ? parsed.error : undefined;
        return (
          getString(nestedError?.message) ??
          getString(nestedError?.error) ??
          getString(parsed.error) ??
          getString(parsed.message) ??
          truncate(responseBody)
        );
      }
    } catch {
      return truncate(responseBody);
    }
  }

  const data = error.data;
  if (isRecord(data)) {
    const nestedError = isRecord(data.error) ? data.error : undefined;
    return getString(nestedError?.message) ?? getString(data.message);
  }

  return undefined;
}

function toUserMessage(error: unknown, statusCode?: number): string {
  const message = getErrorMessage(error);
  const normalized = message.toLowerCase();

  if (
    statusCode === 401 ||
    statusCode === 403 ||
    /unauthorized|forbidden|invalid api key/.test(normalized)
  ) {
    return "模型服务认证失败，请检查 API Key";
  }
  if (statusCode === 429 || /rate.?limit|too many requests/.test(normalized)) {
    return "模型服务请求过于频繁，请稍后重试";
  }
  if (statusCode === 404 || /model.*not found|not found/.test(normalized)) {
    return "当前模型不可用，请检查模型名称";
  }
  if (/timeout|timed out|etimedout/.test(normalized)) {
    return "模型响应超时，请稍后重试";
  }
  if (/econnreset|econnrefused|enotfound|socket|network|connect/.test(normalized)) {
    return "模型服务连接失败，请稍后重试";
  }

  return message;
}

export function formatAIError(error: unknown): string {
  const record = isRecord(error) ? error : undefined;
  const nestedError = getNestedError(error);
  const statusCode =
    getNumber(record?.statusCode) ??
    (isRecord(nestedError) ? getNumber(nestedError.statusCode) : undefined);
  const responseMessage = getResponseMessage(error) ?? getResponseMessage(nestedError);
  const message = toUserMessage(
    responseMessage ? new Error(responseMessage) : (getNestedError(error) ?? error),
    statusCode,
  );

  if (statusCode && !message.includes(String(statusCode)) && statusCode >= 500) {
    return `${message}（服务异常 ${statusCode}）`;
  }
  return truncate(message);
}
