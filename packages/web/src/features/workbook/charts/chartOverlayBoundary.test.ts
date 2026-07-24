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

describe("ChartOverlay integration boundary", () => {
  it("keeps chart interaction outside FortuneSheet's private overlay node", () => {
    expect(overlaySource).not.toContain("createPortal");
    expect(overlaySource).not.toContain("fortune-sheet-overlay");
    expect(overlaySource).not.toContain("fortune-sheet-container");
    expect(viewportSource).toContain("fortune-sheet-container");
    expect(gridSource).toContain("className={styles.chartLayer}");
    expect(gridSource).toContain("layerRef={chartLayerRef}");
  });
});
