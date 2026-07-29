import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const overlaySource = readFileSync(
  resolve(process.cwd(), "src/features/workbook/charts/ChartOverlay.tsx"),
  "utf8",
);
const viewportSource = readFileSync(
  resolve(process.cwd(), "src/features/workbook/charts/useChartViewport.ts"),
  "utf8",
);
const gridSource = readFileSync(
  resolve(process.cwd(), "src/features/workbook/editor/ExcelGrid.tsx"),
  "utf8",
);
const activationSource = readFileSync(
  resolve(process.cwd(), "src/features/workbook/editor/useExcelGridWorkspace.ts"),
  "utf8",
);
const activeSheetSource = readFileSync(
  resolve(process.cwd(), "src/features/workbook/editor/useFortuneSheetActiveSheet.ts"),
  "utf8",
);
const rendererSource = readFileSync(
  resolve(process.cwd(), "src/features/workbook/charts/ChartRenderer.tsx"),
  "utf8",
);

describe("ChartOverlay integration boundary", () => {
  it("keeps chart interaction outside FortuneSheet's private overlay node", () => {
    const activeSheetLayerKey =
      "key={" + "`" + "$" + "{workbook.id}:$" + "{currentSheet.id}" + "`" + "}";

    expect(overlaySource).not.toContain("createPortal");
    expect(overlaySource).not.toContain("fortune-sheet-overlay");
    expect(overlaySource).not.toContain("fortune-sheet-container");
    expect(overlaySource).not.toContain("rowHeaderWidth");
    expect(overlaySource).not.toContain("columnHeaderHeight");
    expect(viewportSource).toContain("fortune-sheet-container");
    expect(viewportSource).toContain("fortune-cell-area");
    expect(viewportSource).not.toContain("fortune-sheet-canvas");
    expect(viewportSource).toContain("cellArea.scrollLeft");
    expect(viewportSource).toContain("cellArea.scrollTop");
    expect(viewportSource).toContain('root.addEventListener("scroll", handleScroll, true)');
    expect(viewportSource).toContain("cellOriginLeft");
    expect(viewportSource).toContain("cellOriginTop");
    expect(gridSource).toContain(activeSheetLayerKey);
    expect(gridSource).toContain("data-sheet-id={currentSheet.id}");
    expect(gridSource).toContain("className={styles.chartLayer}");
    expect(gridSource).toContain("layerRef={chartLayerRef}");
    expect(gridSource).toContain('data-sheet-wheel-owner="true"');
    expect(activationSource).toContain("currentSheetIndex");
    expect(activeSheetSource).toContain("luckysheet-sheets-item-active");
    expect(rendererSource).toContain("RadarChart");
  });
});
