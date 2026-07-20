import type { LoaderFunctionArgs } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchCurrentUser } = vi.hoisted(() => ({
  fetchCurrentUser: vi.fn(),
}));

vi.mock("@/api/auth", () => ({ fetchCurrentUser }));

import { protectedLoader } from "./protectedLoader";

const user = { id: 7, email: "user@example.com", displayName: "User" };

function loaderArgs(params: LoaderFunctionArgs["params"]): LoaderFunctionArgs {
  return { params } as LoaderFunctionArgs;
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
});
