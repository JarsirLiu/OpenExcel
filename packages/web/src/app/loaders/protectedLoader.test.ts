import type { LoaderFunctionArgs } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchCurrentUser } = vi.hoisted(() => ({
  fetchCurrentUser: vi.fn(),
}));

vi.mock("@/api/auth", () => ({ fetchCurrentUser }));

import { ApiError } from "@/api/http";
import { protectedLoader } from "./protectedLoader";

const user = { id: 7, email: "user@example.com", displayName: "User" };

function loaderArgs(params: LoaderFunctionArgs["params"]): LoaderFunctionArgs {
  return {
    params,
    request: new Request("http://localhost/workspaces/ws_existing"),
  } as LoaderFunctionArgs;
}

describe("protectedLoader", () => {
  beforeEach(() => {
    fetchCurrentUser.mockReset();
    fetchCurrentUser.mockResolvedValue(user);
  });

  it("only resolves the current user for a protected route", async () => {
    await expect(
      protectedLoader(loaderArgs({ workspacePublicId: "ws_existing" })),
    ).resolves.toEqual({
      currentUser: user,
    });
  });

  it("preserves the protected URL when redirecting to login", async () => {
    fetchCurrentUser.mockRejectedValue(new ApiError("unauthenticated", 401));

    const redirectResponse = await protectedLoader(
      loaderArgs({ workspacePublicId: "ws_existing" }),
    ).catch((error: unknown) => error);

    expect(redirectResponse).toBeInstanceOf(Response);
    expect((redirectResponse as Response).headers.get("location")).toBe(
      "/login?returnTo=%2Fworkspaces%2Fws_existing",
    );
  });
});
