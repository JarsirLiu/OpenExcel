export const API_BASE = "/api";

type ApiConfig = {
  getAccessToken?: () => string | null | undefined;
  credentials?: RequestCredentials;
};

let apiConfig: ApiConfig = {
};

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

export function configureApi(nextConfig: ApiConfig): void {
  apiConfig = {
    ...apiConfig,
    ...nextConfig,
  };
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = apiConfig.getAccessToken?.();
  const requestInit: RequestInit = { ...init };

  if (token) {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    requestInit.headers = headers;
  }

  if (apiConfig.credentials !== undefined && requestInit.credentials === undefined) {
    requestInit.credentials = apiConfig.credentials;
  }

  return Object.keys(requestInit).length > 0 ? fetch(`${API_BASE}${path}`, requestInit) : fetch(`${API_BASE}${path}`);
}
