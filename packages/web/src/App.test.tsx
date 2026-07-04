import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import type { SheetSchema } from "./api/workbooks";

// Mock the ExcelGrid since Fortune-Sheet is complex and not needed for this test
vi.mock("./features/workbook/editor/ExcelGrid", () => ({
  ExcelGrid: () => <div data-testid="excel-grid">ExcelGrid</div>,
}));

// Mock the API client
vi.mock("./api/workbooks", () => ({
  fetchWorkbooks: vi.fn().mockResolvedValue([]),
  fetchWorkbook: vi.fn(),
  fetchWorkbookReferenceCandidates: vi.fn().mockResolvedValue([]),
  uploadExcel: vi.fn(),
  uploadNewWorkbook: vi.fn(),
  deleteWorkbook: vi.fn(),
  updateSheetData: vi.fn(),
  createSheet: vi.fn(),
  deleteSheet: vi.fn(),
  downloadTemplateUrl: vi.fn(),
}));

vi.mock("./api/sessions", () => ({
  fetchSessions: vi.fn().mockResolvedValue([]),
  createSession: vi.fn().mockResolvedValue({
    id: 1,
    sheetId: null,
    name: "新对话",
    createdAt: new Date().toISOString(),
  }),
  deleteSession: vi.fn(),
  renameSession: vi.fn(),
  generateSessionTitle: vi.fn().mockResolvedValue({ title: "新对话" }),
}));

vi.mock("./api/workspaces", () => ({
  fetchWorkspaces: vi.fn().mockResolvedValue([{ id: 1, name: "默认工作区", order: 0 }]),
}));

vi.mock("./api/chat", () => ({
  fetchMessages: vi.fn().mockResolvedValue([]),
  fetchRuns: vi.fn().mockResolvedValue([]),
  undoLatestRun: vi.fn().mockResolvedValue({ runId: 1, restoredSheetIds: [] }),
}));

import App from "./App";

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", async () => {
    const { container } = render(<App />);
    await waitFor(() => {
      expect(container).toBeTruthy();
    });
  });
});

describe("SheetSchema type", () => {
  it("has correct structure", () => {
    const sheet: SheetSchema = {
      id: 1,
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
