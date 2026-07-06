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

vi.mock("./features/auth/useAuthState.js", () => ({
  useAuthState: () => ({
    currentUser: { id: 1, email: "user@example.com", displayName: "User" },
    loading: false,
    submitting: false,
    error: null,
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    setError: vi.fn(),
  }),
}));

import App from "./App";

const testRouter = createHashRouter([
  {
    path: "/",
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
