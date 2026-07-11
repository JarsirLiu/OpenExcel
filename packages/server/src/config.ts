import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

loadDotenv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env"),
});

export interface ModelConfig {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  maxRetries: number;
  timeoutMs: number;
  chunkTimeoutMs: number;
}

let cachedConfig: ModelConfig | null = null;

function readNonNegativeInt(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function loadModelConfig(): ModelConfig {
  if (cachedConfig) return cachedConfig;

  const baseUrl = process.env.MODEL_BASE_URL?.trim();
  const apiKey = process.env.MODEL_API_KEY?.trim();
  const modelName = process.env.MODEL_NAME?.trim();

  const missing = [
    !baseUrl && "MODEL_BASE_URL",
    !apiKey && "MODEL_API_KEY",
    !modelName && "MODEL_NAME",
  ].filter((name): name is string => Boolean(name));

  if (missing.length > 0) {
    throw new Error(`缺少模型环境变量: ${missing.join(", ")}`);
  }

  cachedConfig = {
    baseUrl: baseUrl as string,
    apiKey: apiKey as string,
    modelName: modelName as string,
    maxRetries: readNonNegativeInt("MODEL_MAX_RETRIES", 2),
    timeoutMs: readNonNegativeInt("MODEL_TIMEOUT_MS", 120_000),
    chunkTimeoutMs: readNonNegativeInt("MODEL_CHUNK_TIMEOUT_MS", 30_000),
  };
  console.log(`[config] Loaded model config: ${modelName} @ ${baseUrl}`);
  return cachedConfig;
}
