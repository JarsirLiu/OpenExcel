import type { ServerToolDefinition } from "../../../shared/tools/serverTool.js";
import { clearCells } from "./clearCells.js";
import { findSheetCells } from "./findSheetCells.js";
import { mergeCells } from "./mergeCells.js";
import { readSheetData } from "./readSheetData.js";
import { readSheetObjects } from "./readSheetObjects.js";
import { unmergeCells } from "./unmergeCells.js";
import { writeCells } from "./writeCells.js";

export const excelToolManifest = [
  readSheetData,
  findSheetCells,
  readSheetObjects,
  writeCells,
  clearCells,
  mergeCells,
  unmergeCells,
] as const satisfies readonly ServerToolDefinition[];
