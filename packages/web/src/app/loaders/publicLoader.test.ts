import type { LoaderFunctionArgs } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchCurrentUser } = vi.hoisted(() => ({
  fetchCurrentUser: vi.fn(),
}));

vi.mock("@/api/auth", () => ({ fetchCurrentUser }));

import { ApiError } from "@/api/http";
import { authPageLoader, homeLoader } from "./publicLoader";

const user = { id: 7, email: "user@example.com", displayName: "User" };

function loaderArgs(url: string): LoaderFunctionArgs {
  return { request: new Request(url) } as LoaderFunctionArgs;
}

describe("public route loaders", () => {
  beforeEach(() => {
    fetchCurrentUser.mockReset();
  });

  it("keeps unauthenticated users on the auth page", async () => {
    fetchCurrentUser.mockRejectedValue(new ApiError("unauthenticated", 401));

    await expect(authPageLoader(loaderArgs("http://localhost/login"))).resolves.toBeNull();
  });

  it("returns the current user for the home page when a session exists", async () => {
    fetchCurrentUser.mockResolvedValue(user);

    await expect(homeLoader()).resolves.toEqual({ currentUser: user });
  });

  it("returns authenticated users from the auth page to the public home route", async () => {
    fetchCurrentUser.mockResolvedValue(user);

    const redirectResponse = await authPageLoader(loaderArgs("http://localhost/login")).catch(
      (error: unknown) => error,
    );
    expect(redirectResponse).toBeInstanceOf(Response);
    const response = redirectResponse as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
  });

  it("returns an authenticated user to the requested internal route", async () => {
    fetchCurrentUser.mockResolvedValue(user);

    const redirectResponse = await authPageLoader(
      loaderArgs("http://localhost/login?returnTo=%2Fworkspaces%2Fws_existing%3Ftab%3Dchat"),
    ).catch((error: unknown) => error);

    expect(redirectResponse).toBeInstanceOf(Response);
    expect((redirectResponse as Response).headers.get("location")).toBe(
      "/workspaces/ws_existing?tab=chat",
    );
  });
});
