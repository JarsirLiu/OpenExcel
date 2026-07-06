import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { createHashRouter, RouterProvider } from "react-router-dom";
import type { SheetSchema } from "./api/workbooks";

vi.mock("./app/Workbench.js", () => ({
  Workbench: () => <div data-testid="workbench">Workbench</div>,
}));

vi.mock("./features/auth/AuthScreen.js", () => ({
  AuthScreen: () => <div data-testid="auth-screen">AuthScreen</div>,
}));

vi.mock("./api/auth.js", () => ({
  fetchCurrentUser: vi.fn().mockResolvedValue({ id: 1, email: "user@example.com", displayName: "User" }),
  logout: vi.fn(),
}));

vi.mock("./api/workspaces.js", () => ({
  fetchWorkspaces: vi.fn().mockResolvedValue([]),
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

import App from "./App";

const testRouter = createHashRouter([
  {
    id: "protected",
    loader: async () => ({ currentUser: { id: 1, email: "user@example.com", displayName: "User" } }),
    children: [
      {
        path: "*",
        element: <App />,
      },
    ],
  },
  {
    path: "/login",
    element: <App />,
  },
  {
    path: "/register",
    element: <App />,
  },
]);

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the workbench when authenticated", async () => {
    const { container } = render(<RouterProvider router={testRouter} />);
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
