import { apiFetch, readErrorMessage } from "./http";

export interface CurrentUser {
  id: number;
  email: string;
  displayName: string;
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  const res = await apiFetch("/auth/me");
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "未登录"));
  }
  const data = await res.json();
  return data.user ?? data;
}

export async function register(input: { email: string; password: string; displayName?: string }): Promise<CurrentUser> {
  const res = await apiFetch("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "注册失败"));
  }
  const data = await res.json();
  return data.user ?? data;
}

export async function login(input: { email: string; password: string }): Promise<CurrentUser> {
  const res = await apiFetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "登录失败"));
  }
  const data = await res.json();
  return data.user ?? data;
}

export async function logout(): Promise<void> {
  const res = await apiFetch("/auth/logout", { method: "POST" });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, "退出失败"));
  }
}
