import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SheetSchema } from "./api/client";

// Mock the ExcelGrid since Fortune-Sheet is complex and not needed for this test
vi.mock("./components/ExcelGrid", () => ({
  ExcelGrid: () => <div data-testid="excel-grid">ExcelGrid</div>,
}));

// Mock the API client
vi.mock("./api/client", () => ({
  fetchWorkbooks: vi.fn().mockResolvedValue([]),
  fetchWorkbook: vi.fn(),
}));

import App from "./App";

describe("App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", () => {
    const { container } = render(<App />);
    expect(container).toBeTruthy();
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
      rows: [],
      uploadedData: null,
    };
    expect(sheet.name).toBe("TestSheet");
    expect(sheet.columns).toHaveLength(2);
  });
});