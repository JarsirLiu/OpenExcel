import { beforeEach, describe, expect, it, vi } from "vitest";

const { bootstrapWorkspace, fetchCurrentUser } = vi.hoisted(() => ({
  bootstrapWorkspace: vi.fn(),
  fetchCurrentUser: vi.fn(),
}));

vi.mock("@/api/auth", () => ({ fetchCurrentUser }));
vi.mock("@/api/workspaces", () => ({ bootstrapWorkspace }));

import { authPageLoader, publicHomeLoader } from "./publicLoader";

const user = { id: 7, email: "user@example.com", displayName: "User" };

describe("public route loaders", () => {
  beforeEach(() => {
    fetchCurrentUser.mockReset();
    bootstrapWorkspace.mockReset();
  });

  it("keeps unauthenticated users on the public home page", async () => {
    fetchCurrentUser.mockRejectedValue(new Error("unauthenticated"));

    await expect(publicHomeLoader()).resolves.toBeNull();
    expect(bootstrapWorkspace).not.toHaveBeenCalled();
  });

  it("redirects authenticated users to their default workspace", async () => {
    fetchCurrentUser.mockResolvedValue(user);
    bootstrapWorkspace.mockResolvedValue({ publicId: "ws_test" });

    const redirectResponse = await publicHomeLoader().catch((error: unknown) => error);
    expect(redirectResponse).toBeInstanceOf(Response);
    const response = redirectResponse as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/workspaces/ws_test");
    expect(bootstrapWorkspace).toHaveBeenCalledWith(user.id);
  });

  it("uses the same redirect policy for login and register routes", async () => {
    fetchCurrentUser.mockRejectedValue(new Error("unauthenticated"));

    await expect(authPageLoader()).resolves.toBeNull();
  });
});
