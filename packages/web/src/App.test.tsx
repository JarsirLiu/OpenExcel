import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SheetSchema } from "./api/workbooks";

const { authActions } = vi.hoisted(() => ({
  authActions: {
    submitting: false,
    error: null,
    signIn: vi.fn().mockResolvedValue({ id: 1 }),
    signUp: vi.fn().mockResolvedValue({ id: 1 }),
  },
}));

vi.mock("./app/Workbench.js", () => ({
  Workbench: () => <div data-testid="workbench">Workbench</div>,
}));

vi.mock("./features/auth/AuthScreen.js", () => ({
  AuthScreen: ({
    onLogin,
    onSwitchMode,
  }: {
    onLogin: () => Promise<unknown>;
    onSwitchMode: () => void;
  }) => (
    <>
      <div data-testid="auth-screen">AuthScreen</div>
      <button type="button" data-testid="submit-login" onClick={() => void onLogin()}>
        Login
      </button>
      <button type="button" data-testid="switch-mode" onClick={onSwitchMode}>
        Switch mode
      </button>
    </>
  ),
}));

vi.mock("./features/auth/useAuthActions.js", () => ({
  useAuthActions: () => authActions,
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

// Mock route loader data for the standalone page test.
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

import { AuthPage } from "./App";

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <div data-testid="location">{location.pathname}</div>
      <div data-testid="location-search">{location.pathname + location.search}</div>
      <button type="button" data-testid="back" onClick={() => navigate(-1)}>
        Back
      </button>
    </>
  );
}

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authActions.submitting = false;
    authActions.error = null;
  });

  it("renders the public homepage at the root route", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthPage mode="login" />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(container.querySelector('[data-testid="auth-screen"]')).toBeTruthy();
    });
  });

  it("keeps the root route in history when entering a workspace", async () => {
    const { getByTestId } = render(
      <MemoryRouter initialEntries={["/"]}>
        <AuthPage mode="login" />
        <LocationProbe />
      </MemoryRouter>,
    );

    await act(async () => {
      getByTestId("submit-login").click();
    });
    await waitFor(() => {
      expect(getByTestId("location").textContent).toBe("/workspaces/ws_test");
    });

    await act(async () => {
      getByTestId("back").click();
    });
    await waitFor(() => {
      expect(getByTestId("location").textContent).toBe("/");
    });
  });

  it("preserves returnTo when switching from login to register", async () => {
    const { getByTestId } = render(
      <MemoryRouter initialEntries={["/login?returnTo=%2Fworkspaces%2Fws_target%3Ftab%3Dchat"]}>
        <AuthPage mode="login" />
        <LocationProbe />
      </MemoryRouter>,
    );

    await act(async () => {
      getByTestId("switch-mode").click();
    });

    await waitFor(() => {
      expect(getByTestId("location-search").textContent).toBe(
        "/register?returnTo=%2Fworkspaces%2Fws_target%3Ftab%3Dchat",
      );
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
