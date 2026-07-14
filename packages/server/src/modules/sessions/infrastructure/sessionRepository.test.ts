import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("../../../infra/database/db.js", () => ({
  prisma: {
    session: {
      findMany: mocks.findMany,
    },
  },
}));

import { findSessionsByWorkspace } from "./sessionRepository.js";

describe("sessionRepository", () => {
  beforeEach(() => {
    mocks.findMany.mockReset();
  });

  it("lists only persisted conversation metadata", async () => {
    mocks.findMany.mockResolvedValueOnce([]);

    await findSessionsByWorkspace(7);

    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 7, chatMessages: { not: "[]" } },
      select: {
        id: true,
        publicId: true,
        sheetId: true,
        name: true,
        titleStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  });
});
