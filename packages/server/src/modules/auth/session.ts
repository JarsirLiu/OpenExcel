import { randomBytes, createHash } from "node:crypto";

export const AUTH_SESSION_COOKIE_NAME = "openexcel_session";
export const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const COOKIE_PATH = "Path=/";
const COOKIE_HTTP_ONLY = "HttpOnly";
const COOKIE_SAME_SITE = "SameSite=Lax";
const COOKIE_SECURE = process.env.NODE_ENV === "production" ? "Secure" : null;

export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};

  return cookieHeader.split(";").reduce<Record<string, string>>((acc, part) => {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex < 0) return acc;
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (key) {
      acc[key] = decodeURIComponent(value);
    }
    return acc;
  }, {});
}

export function createSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function buildSessionCookie(token: string): string {
  return [
    `${AUTH_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    COOKIE_PATH,
    COOKIE_HTTP_ONLY,
    COOKIE_SAME_SITE,
    COOKIE_SECURE,
    `Max-Age=${AUTH_SESSION_MAX_AGE_SECONDS}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join("; ");
}

export function buildClearedSessionCookie(): string {
  return [
    `${AUTH_SESSION_COOKIE_NAME}=`,
    COOKIE_PATH,
    COOKIE_HTTP_ONLY,
    COOKIE_SAME_SITE,
    COOKIE_SECURE,
    "Max-Age=0",
  ]
    .filter((part): part is string => Boolean(part))
    .join("; ");
}

export function extractSessionTokenFromCookie(cookieHeader: string | undefined): string | null {
  const cookies = parseCookieHeader(cookieHeader);
  const token = cookies[AUTH_SESSION_COOKIE_NAME];
  return token?.trim() ? token : null;
}
