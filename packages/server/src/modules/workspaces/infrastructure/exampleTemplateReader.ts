import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { InitConfig } from "@openexcel/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const exampleTemplatePath = resolve(__dirname, "../../../../../../templates/init.json");

export function loadExampleTemplate(): InitConfig {
  const raw = readFileSync(exampleTemplatePath, "utf-8");
  return JSON.parse(raw) as InitConfig;
}
