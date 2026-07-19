import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MAX_CONVERSATION_TURNS,
  DEFAULT_MAX_USER_INPUT_TOKENS,
  DEFAULT_READ_SHEET_DATA_BUDGET_TOKENS,
  DEFAULT_TOOL_RESULT_BUDGET_TOKENS,
  DEFAULT_TOOL_RESULT_MAX_TOKENS,
} from "@openexcel/agent";
import { config as loadDotenv } from "dotenv";

export { loadStorageConfig } from "./infra/storage/storageConfig.js";

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
  contextWindowTokens: number;
  outputReserveTokens: number;
  maxConversationTurns: number;
  maxUserInputTokens: number;
  toolResultBudgetTokens: number;
  toolResultMaxTokens: number;
  readSheetDataBudgetTokens: number;
}

let cachedConfig: ModelConfig | null = null;

const DEFAULT_MODEL_MAX_RETRIES = 2;
const MAX_MODEL_MAX_RETRIES = 3;

function readNonNegativeInt(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function readBoundedNonNegativeInt(name: string, fallback: number, max: number): number {
  return Math.min(readNonNegativeInt(name, fallback), max);
}

function readPositiveInt(name: string, fallback: number): number {
  const value = readNonNegativeInt(name, fallback);
  return value > 0 ? value : fallback;
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
    maxRetries: readBoundedNonNegativeInt(
      "MODEL_MAX_RETRIES",
      DEFAULT_MODEL_MAX_RETRIES,
      MAX_MODEL_MAX_RETRIES,
    ),
    timeoutMs: readNonNegativeInt("MODEL_TIMEOUT_MS", 120_000),
    chunkTimeoutMs: readNonNegativeInt("MODEL_CHUNK_TIMEOUT_MS", 30_000),
    contextWindowTokens: readPositiveInt("MODEL_CONTEXT_WINDOW_TOKENS", 180_000),
    outputReserveTokens: readPositiveInt("MODEL_OUTPUT_RESERVE_TOKENS", 16_000),
    maxConversationTurns: readPositiveInt(
      "MODEL_MAX_CONVERSATION_TURNS",
      DEFAULT_MAX_CONVERSATION_TURNS,
    ),
    maxUserInputTokens: readPositiveInt(
      "MODEL_MAX_USER_INPUT_TOKENS",
      DEFAULT_MAX_USER_INPUT_TOKENS,
    ),
    toolResultBudgetTokens: readPositiveInt(
      "MODEL_TOOL_RESULT_BUDGET_TOKENS",
      DEFAULT_TOOL_RESULT_BUDGET_TOKENS,
    ),
    toolResultMaxTokens: readPositiveInt(
      "MODEL_TOOL_RESULT_MAX_TOKENS",
      DEFAULT_TOOL_RESULT_MAX_TOKENS,
    ),
    readSheetDataBudgetTokens: readPositiveInt(
      "MODEL_READ_SHEET_DATA_BUDGET_TOKENS",
      DEFAULT_READ_SHEET_DATA_BUDGET_TOKENS,
    ),
  };
  console.log(`[config] Loaded model config: ${modelName} @ ${baseUrl}`);
  return cachedConfig;
}
