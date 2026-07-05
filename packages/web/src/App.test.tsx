import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import type { SheetSchema } from "./api/workbooks";

vi.mock("./app/Workbench", () => ({
  Workbench: () => <div data-testid="workbench">Workbench</div>,
}));

vi.mock("./features/auth/AuthScreen", () => ({
  AuthScreen: () => <div data-testid="auth-screen">AuthScreen</div>,
}));

vi.mock("./features/auth/useAuthState", () => ({
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

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the workbench when authenticated", async () => {
    const { container } = render(<App />);
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
