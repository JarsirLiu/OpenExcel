export const routePaths = {
  home: "/",
  login: "/login",
  register: "/register",
  demo: (demoId: string) => `/demos/${demoId}`,
  workspace: (publicId: string) => `/workspaces/${publicId}`,
} as const;
