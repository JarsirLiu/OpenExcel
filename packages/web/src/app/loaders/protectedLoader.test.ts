import type { LoaderFunctionArgs } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { bootstrapWorkspace, fetchCurrentUser } = vi.hoisted(() => ({
  bootstrapWorkspace: vi.fn(),
  fetchCurrentUser: vi.fn(),
}));

vi.mock("@/api/auth", () => ({ fetchCurrentUser }));
vi.mock("@/api/workspaces", () => ({ bootstrapWorkspace }));

import { protectedLoader } from "./protectedLoader";

const user = { id: 7, email: "user@example.com", displayName: "User" };

function loaderArgs(params: LoaderFunctionArgs["params"]): LoaderFunctionArgs {
  return { params } as LoaderFunctionArgs;
}

describe("protectedLoader", () => {
  beforeEach(() => {
    fetchCurrentUser.mockReset();
    bootstrapWorkspace.mockReset();
    fetchCurrentUser.mockResolvedValue(user);
  });

  it("bootstraps the user workspace when a protected route has no workspace", async () => {
    const workspace = { id: 11, publicId: "ws_test", name: "Test", order: 0 };
    bootstrapWorkspace.mockResolvedValue(workspace);

    await expect(protectedLoader(loaderArgs({}))).rejects.toMatchObject({ status: 302 });

    expect(bootstrapWorkspace).toHaveBeenCalledWith(user.id);
  });

  it("only resolves the current user for a direct workspace route", async () => {
    await expect(
      protectedLoader(loaderArgs({ workspacePublicId: "ws_existing" })),
    ).resolves.toEqual({
      currentUser: user,
    });

    expect(bootstrapWorkspace).not.toHaveBeenCalled();
  });
});
