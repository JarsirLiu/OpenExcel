import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createWorkspace: vi.fn(),
  createWorkbook: vi.fn(),
  importWorkbooks: vi.fn(),
}));

vi.mock("@/api/workspaces", () => ({
  createWorkspace: mocks.createWorkspace,
}));

vi.mock("@/api/workbooks", () => ({
  createWorkbook: mocks.createWorkbook,
  importWorkbooks: mocks.importWorkbooks,
}));

import {
  createProject,
  createProjectFromImport,
  createProjectWithBlankWorkbook,
} from "./projectCreation";

describe("project creation flows", () => {
  beforeEach(() => {
    mocks.createWorkspace.mockReset();
    mocks.createWorkbook.mockReset();
    mocks.importWorkbooks.mockReset();
    mocks.createWorkspace.mockResolvedValue({ id: 7, publicId: "ws_7", name: "新项目", order: 0 });
    mocks.createWorkbook.mockResolvedValue({ id: 8 });
    mocks.importWorkbooks.mockResolvedValue([{ id: 8, publicId: "wb_8", name: "预算", sheets: 1 }]);
  });

  it("creates only a project from the sidebar project action", async () => {
    await expect(createProject()).resolves.toMatchObject({ id: 7 });

    expect(mocks.createWorkspace).toHaveBeenCalledWith("新项目");
    expect(mocks.createWorkbook).not.toHaveBeenCalled();
    expect(mocks.importWorkbooks).not.toHaveBeenCalled();
  });

  it("creates one blank workbook from the empty-state workbook action", async () => {
    await expect(createProjectWithBlankWorkbook()).resolves.toMatchObject({ id: 7 });

    expect(mocks.createWorkspace).toHaveBeenCalledWith("新项目");
    expect(mocks.createWorkbook).toHaveBeenCalledWith(7);
    expect(mocks.importWorkbooks).not.toHaveBeenCalled();
  });

  it("imports directly into a new project without creating a blank workbook", async () => {
    const file = new File(["data"], "report.xlsx");
    await expect(createProjectFromImport(file)).resolves.toMatchObject({
      workspace: { id: 7 },
      imported: [{ id: 8 }],
    });

    expect(mocks.createWorkspace).toHaveBeenCalledWith("新项目");
    expect(mocks.importWorkbooks).toHaveBeenCalledWith(7, file);
    expect(mocks.createWorkbook).not.toHaveBeenCalled();
  });
});
