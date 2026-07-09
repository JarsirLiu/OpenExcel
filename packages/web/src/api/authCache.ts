import type { CurrentUser } from "@/api/auth";

let cachedUser: CurrentUser | null = null;

export function setCachedUser(user: CurrentUser) {
  cachedUser = user;
}

export function getCachedUser(): CurrentUser | null {
  return cachedUser;
}

export function clearCachedUser() {
  cachedUser = null;
}
