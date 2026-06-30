import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import toml from "@iarna/toml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(__dirname, "../../../config/config.toml");

export interface ModelConfig {
  baseUrl: string;
  apiKey: string;
  modelName: string;
}

let cachedConfig: ModelConfig | null = null;

export function loadModelConfig(): ModelConfig {
  if (cachedConfig) return cachedConfig;

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = toml.parse(raw) as unknown as { model: ModelConfig };
    cachedConfig = parsed.model;
    console.log(`[config] Loaded model config: ${parsed.model.modelName} @ ${parsed.model.baseUrl}`);
    return cachedConfig;
  } catch (err) {
    console.error(`[config] Failed to load config from ${configPath}:`, err);
    throw new Error("无法加载模型配置，请检查 config/config.toml");
  }
}