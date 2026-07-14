import { render, waitFor } from "@testing-library/react";
import { HashRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SheetSchema } from "./api/workbooks";

vi.mock("./app/Workbench.js", () => ({
  Workbench: () => <div data-testid="workbench">Workbench</div>,
}));

vi.mock("./features/auth/AuthScreen.js", () => ({
  AuthScreen: () => <div data-testid="auth-screen">AuthScreen</div>,
}));

vi.mock("./api/auth.js", () => ({
  fetchCurrentUser: vi
    .fn()
    .mockResolvedValue({ id: 1, email: "user@example.com", displayName: "User" }),
  logout: vi.fn(),
}));

vi.mock("./api/workspaces.js", () => ({
  fetchWorkspaces: vi.fn().mockResolvedValue([]),
  bootstrapWorkspace: vi
    .fn()
    .mockResolvedValue({ id: 1, publicId: "ws_test", name: "Test", order: 0 }),
}));

vi.mock("./api/workbooks.js", () => ({
  fetchWorkbooks: vi.fn().mockResolvedValue([]),
}));

vi.mock("./api/sessions.js", () => ({
  fetchSessions: vi.fn().mockResolvedValue([]),
}));

vi.mock("./api/chat.js", () => ({
  fetchMessages: vi.fn().mockResolvedValue({ messages: [], total: 0 }),
}));

// Mock useRouteLoaderData for protected route (createHashRouter not compatible with jsdom)
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useRouteLoaderData: (routeId: string) => {
      if (routeId === "protected") {
        return { currentUser: { id: 1, email: "user@example.com", displayName: "User" } };
      }
      return undefined;
    },
  };
});

import App from "./App";

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the workbench when authenticated", async () => {
    const { container } = render(
      <HashRouter>
        <App />
      </HashRouter>,
    );
    await waitFor(() => {
      expect(container.querySelector('[data-testid="workbench"]')).toBeTruthy();
    });
  });
});

describe("SheetSchema type", () => {
  it("has correct structure", () => {
    const sheet: SheetSchema = {
      id: 1,
      sheetNo: 1,
      name: "TestSheet",
      order: 0,
      columns: [{ label: "Name" }, { label: "Value" }],
      merges: [],
      uploadedData: null,
      config: null,
    };
    expect(sheet.name).toBe("TestSheet");
    expect(sheet.columns).toHaveLength(2);
  });
});
