export const routePaths = {
  home: "/",
  login: "/login",
  register: "/register",
  loginWithReturnTo: (returnTo: string) => withReturnTo("/login", returnTo),
  registerWithReturnTo: (returnTo: string) => withReturnTo("/register", returnTo),
  demo: (demoId: string) => `/demos/${demoId}`,
  workspace: (publicId: string) => `/workspaces/${publicId}`,
} as const;

function withReturnTo(path: string, returnTo: string): string {
  return `${path}?${new URLSearchParams({ returnTo })}`;
}

const internalUrlBase = "https://openexcel.invalid";

export function getInternalReturnTo(value: string | null | undefined): string | null {
  if (!value?.startsWith("/") || value.startsWith("//")) return null;

  const target = new URL(value, internalUrlBase);
  if (target.origin !== internalUrlBase) return null;
  if (target.pathname === routePaths.login || target.pathname === routePaths.register) {
    return null;
  }

  return `${target.pathname}${target.search}${target.hash}`;
}
