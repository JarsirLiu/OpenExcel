import { clearCells } from "./clearCells.js";
import { mergeCells } from "./mergeCells.js";
import { readSheet } from "./readSheet.js";
import { unmergeCells } from "./unmergeCells.js";
import { writeCells } from "./writeCells.js";

export const excelToolManifest = [
  { name: "readSheet", tool: readSheet },
  { name: "writeCells", tool: writeCells, needsRunContext: true },
  { name: "clearCells", tool: clearCells, needsRunContext: true },
  { name: "mergeCells", tool: mergeCells, needsRunContext: true },
  { name: "unmergeCells", tool: unmergeCells, needsRunContext: true },
] as const;

export const excelTools = Object.fromEntries(
  excelToolManifest.map(({ name, tool }) => [name, tool]),
) as Record<(typeof excelToolManifest)[number]["name"], (typeof excelToolManifest)[number]["tool"]>;
