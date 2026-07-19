import { clearCells } from "./clearCells.js";
import { findSheetCells } from "./findSheetCells.js";
import { mergeCells } from "./mergeCells.js";
import { readSheetData } from "./readSheetData.js";
import { readSheetObjects } from "./readSheetObjects.js";
import { unmergeCells } from "./unmergeCells.js";
import { writeCells } from "./writeCells.js";

export const excelToolManifest = [
  { name: "readSheetData", tool: readSheetData },
  { name: "findSheetCells", tool: findSheetCells },
  { name: "readSheetObjects", tool: readSheetObjects },
  { name: "writeCells", tool: writeCells, needsRunContext: true },
  { name: "clearCells", tool: clearCells, needsRunContext: true },
  { name: "mergeCells", tool: mergeCells, needsRunContext: true },
  { name: "unmergeCells", tool: unmergeCells, needsRunContext: true },
] as const;

export const excelTools = Object.fromEntries(
  excelToolManifest.map(({ name, tool }) => [name, tool]),
) as Record<(typeof excelToolManifest)[number]["name"], (typeof excelToolManifest)[number]["tool"]>;
