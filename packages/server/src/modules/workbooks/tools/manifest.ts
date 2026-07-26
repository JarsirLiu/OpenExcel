import type { ServerToolDefinition } from "../../../shared/tools/serverTool.js";
import { createSheet } from "./createSheet.js";
import { createWorkbook } from "./createWorkbook.js";

export const workbookToolManifest = [
  createWorkbook,
  createSheet,
] as const satisfies readonly ServerToolDefinition[];
