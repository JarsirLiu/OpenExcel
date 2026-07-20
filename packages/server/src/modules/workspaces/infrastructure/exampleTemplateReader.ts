import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { InitConfig } from "@openexcel/core";
import { templatesRoot } from "../../../infra/runtimePaths.js";

const exampleTemplatePath = join(templatesRoot, "init.json");

export function loadExampleTemplate(): InitConfig {
  const raw = readFileSync(exampleTemplatePath, "utf-8");
  return JSON.parse(raw) as InitConfig;
}
