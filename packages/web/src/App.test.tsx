import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import type { SheetSchema } from "./api/client";

// Mock the ExcelGrid since Fortune-Sheet is complex and not needed for this test
vi.mock("./features/workbook/ExcelGrid", () => ({
  ExcelGrid: () => <div data-testid="excel-grid">ExcelGrid</div>,
}));

// Mock the API client
vi.mock("./api/client", () => ({
  fetchWorkbooks: vi.fn().mockResolvedValue([]),
  fetchWorkbook: vi.fn(),
  uploadExcel: vi.fn(),
  uploadNewWorkbook: vi.fn(),
  deleteWorkbook: vi.fn(),
  fetchSessions: vi.fn().mockResolvedValue([]),
  createSession: vi.fn().mockResolvedValue({
    id: 1,
    sheetId: null,
    name: "新对话",
    createdAt: new Date().toISOString(),
  }),
  deleteSession: vi.fn(),
  fetchMessages: vi.fn().mockResolvedValue([]),
  generateSessionTitle: vi.fn().mockResolvedValue({ title: "新对话" }),
  undoLatestRun: vi.fn().mockResolvedValue({ runId: 1, restoredSheetIds: [] }),
  updateSheetData: vi.fn(),
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
