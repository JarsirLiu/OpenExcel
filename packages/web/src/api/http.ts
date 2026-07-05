export const API_BASE = "/api";

type ApiErrorResponse = {
  error?: unknown;
};

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return typeof value === "object" && value !== null && "error" in value;
}

export async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (isApiErrorResponse(data) && typeof data.error === "string") {
      return data.error;
    }
  } catch {
    // Ignore parse failures and fall back to the generic message.
  }
  return fallback;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, init);
}
