import { createWorkbook } from "./createWorkbook.js";
import { createSheet } from "./createSheet.js";

export const workbookToolManifest = [
  { name: "createWorkbook", tool: createWorkbook },
  { name: "createSheet", tool: createSheet },
] as const;

export const workbookTools = Object.fromEntries(
  workbookToolManifest.map(({ name, tool }) => [name, tool]),
) as Record<(typeof workbookToolManifest)[number]["name"], (typeof workbookToolManifest)[number]["tool"]>;
