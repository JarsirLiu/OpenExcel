import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("../../../infra/database/db.js", () => ({
  prisma: {
    sheet: {
      findFirst: mocks.findFirst,
      updateMany: mocks.updateMany,
      findUnique: mocks.findUnique,
    },
  },
}));

import { updateSheetData } from "./sheetRepository.js";

describe("sheetRepository.updateSheetData", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it("returns the revision produced by its conditional update", async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: 7, workbook: { workspaceId: 3 } });
    mocks.updateMany.mockResolvedValueOnce({ count: 1 });

    await expect(updateSheetData(7, { uploadedData: "[]" }, 4, 3)).resolves.toEqual({
      revision: 5,
    });

    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
