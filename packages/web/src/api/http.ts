export const API_BASE = "/api";

export type ApiErrorParams = Record<string, string | number>;

export type ApiErrorPayload = {
  error?: unknown;
  message?: unknown;
  errorCode?: unknown;
  params?: unknown;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errorCode?: string,
    public readonly params?: ApiErrorParams,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readParams(value: unknown): ApiErrorParams | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const params: ApiErrorParams = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" || typeof item === "number") params[key] = item;
  }
  return Object.keys(params).length > 0 ? params : undefined;
}

function toApiError(payload: unknown, status: number, fallback: string): ApiError {
  if (!isApiErrorPayload(payload)) return new ApiError(fallback, status);
  const message = readString(payload.message) ?? readString(payload.error) ?? fallback;
  const errorCode = readString(payload.errorCode);
  return new ApiError(message, status, errorCode, readParams(payload.params));
}

export async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data: unknown = await res.json();
    return toApiError(data, res.status, fallback).message;
  } catch {
    // Ignore parse failures and fall back to the generic message.
  }
  return fallback;
}

export async function readApiError(res: Response, fallback = "Request failed"): Promise<ApiError> {
  try {
    return toApiError(await res.json(), res.status, fallback);
  } catch {
    return new ApiError(fallback, res.status);
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, init);
}
