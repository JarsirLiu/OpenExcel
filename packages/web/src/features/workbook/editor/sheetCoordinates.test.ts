import { describe, expect, it } from "vitest";
import {
  documentRowToRendererRow,
  isRendererHeaderRow,
  rendererRowToDocumentRow,
} from "./sheetCoordinates";

describe("sheetCoordinates", () => {
  it("maps canonical rows below the renderer header", () => {
    expect(documentRowToRendererRow(0, 1)).toBe(1);
    expect(rendererRowToDocumentRow(1, 1)).toBe(0);
  });

  it("keeps rows unchanged when a sheet has no renderer header", () => {
    expect(documentRowToRendererRow(4, 0)).toBe(4);
    expect(rendererRowToDocumentRow(4, 0)).toBe(4);
  });

  it("recognizes only rows reserved for the renderer header", () => {
    expect(isRendererHeaderRow(0, 1)).toBe(true);
    expect(isRendererHeaderRow(1, 1)).toBe(false);
  });
});
