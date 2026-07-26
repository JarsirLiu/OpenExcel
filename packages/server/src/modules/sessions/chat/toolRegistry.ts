import { createServerToolRegistry } from "../../../shared/tools/registry.js";
import { chartToolManifest } from "../../charts/tools/manifest.js";
import { excelToolManifest } from "../../sheets/tools/manifest.js";
import { workbookToolManifest } from "../../workbooks/tools/manifest.js";

export const serverToolRegistry = createServerToolRegistry([
  ...workbookToolManifest,
  ...excelToolManifest,
  ...chartToolManifest,
]);
