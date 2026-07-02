import { readSheet } from "./readSheet.js";
import { writeCells } from "./writeCells.js";
import { clearCells } from "./clearCells.js";
import { mergeCells } from "./mergeCells.js";
import { unmergeCells } from "./unmergeCells.js";

type ExcelTool = {
  description: string;
};

type ExcelToolManifestEntry = {
  name: string;
  tool: ExcelTool;
  needsRunContext?: boolean;
};

export const excelToolManifest = [
  { name: "readSheet", tool: readSheet },
  { name: "writeCells", tool: writeCells, needsRunContext: true },
  { name: "clearCells", tool: clearCells, needsRunContext: true },
  { name: "mergeCells", tool: mergeCells, needsRunContext: true },
  { name: "unmergeCells", tool: unmergeCells, needsRunContext: true },
] satisfies readonly ExcelToolManifestEntry[];

export const excelTools = Object.fromEntries(
  excelToolManifest.map(({ name, tool }) => [name, tool]),
) as Record<(typeof excelToolManifest)[number]["name"], (typeof excelToolManifest)[number]["tool"]>;

export function buildExcelToolCatalog(): string {
  return excelToolManifest
    .map(({ name, tool }) => `- **${name}**: ${tool.description}`)
    .join("\n");
}

export function buildExcelToolContext(runId: number): Record<string, { runId: number }> {
  return Object.fromEntries(
    excelToolManifest
      .filter((entry) => entry.needsRunContext)
      .map(({ name }) => [name, { runId }]),
  ) as Record<string, { runId: number }>;
}
