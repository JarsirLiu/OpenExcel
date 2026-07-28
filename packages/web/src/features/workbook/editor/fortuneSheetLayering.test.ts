import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(
  resolve(process.cwd(), "src/features/workbook/editor/ExcelGrid.module.css"),
  "utf8",
);
const workspaceStyles = readFileSync(
  resolve(process.cwd(), "src/features/workbook/ui/ExcelWorkspace.module.css"),
  "utf8",
);
const workspaceViewStyles = readFileSync(
  resolve(process.cwd(), "src/features/workspace/WorkspaceView.module.css"),
  "utf8",
);

describe("FortuneSheet layering contract", () => {
  it("keeps FortuneSheet layers inside the responsive editor column", () => {
    expect(styles).toMatch(/\.fortune-container[\s\S]*?overflow:\s*visible/);
    expect(styles).toMatch(/\.fortune-toolbar[\s\S]*?z-index:\s*30/);
    expect(styles).toMatch(/\.fortune-fx-editor[\s\S]*?z-index:\s*20/);
    expect(styles).toMatch(/fortune-sheet-container[\s\S]*?z-index:\s*1/);
    expect(styles).toMatch(/\.fortune-tooltip[\s\S]*?z-index:\s*100/);
    expect(workspaceStyles).toMatch(/\.container[\s\S]*?min-width:\s*0/);
    expect(workspaceStyles).toMatch(/\.container[\s\S]*?min-height:\s*0/);
    expect(workspaceViewStyles).toMatch(/\.excelArea[\s\S]*?min-width:\s*0/);
    expect(workspaceViewStyles).toMatch(/\.excelArea[\s\S]*?min-height:\s*0/);
    expect(workspaceViewStyles).toMatch(/\.excelArea[\s\S]*?overflow:\s*hidden/);
  });
});
