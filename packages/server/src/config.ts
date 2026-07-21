import {
  DEFAULT_MAX_CONVERSATION_TURNS,
  DEFAULT_MAX_USER_INPUT_TOKENS,
  DEFAULT_READ_SHEET_DATA_BUDGET_TOKENS,
  DEFAULT_TOOL_RESULT_BUDGET_TOKENS,
  DEFAULT_TOOL_RESULT_MAX_TOKENS,
} from "@openexcel/agent";
import { config as loadDotenv } from "dotenv";
import { environmentFile } from "./infra/runtimePaths.js";

export { loadStorageConfig } from "./infra/storage/storageConfig.js";

loadDotenv({
  path: environmentFile,
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

function readNonNegativeInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const value = env[name]?.trim();
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function readBoundedNonNegativeInt(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  max: number,
): number {
  return Math.min(readNonNegativeInt(env, name, fallback), max);
}

function readPositiveInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const value = readNonNegativeInt(env, name, fallback);
  return value > 0 ? value : fallback;
}

export function createModelConfig(env: NodeJS.ProcessEnv): ModelConfig {
  const baseUrl = env.MODEL_BASE_URL?.trim();
  const apiKey = env.MODEL_API_KEY?.trim();
  const modelName = env.MODEL_NAME?.trim();

  const missing = [
    !baseUrl && "MODEL_BASE_URL",
    !apiKey && "MODEL_API_KEY",
    !modelName && "MODEL_NAME",
  ].filter((name): name is string => Boolean(name));

  if (missing.length > 0) {
    throw new Error(`缺少模型环境变量: ${missing.join(", ")}`);
  }

  return {
    baseUrl: baseUrl as string,
    apiKey: apiKey as string,
    modelName: modelName as string,
    maxRetries: readBoundedNonNegativeInt(
      env,
      "MODEL_MAX_RETRIES",
      DEFAULT_MODEL_MAX_RETRIES,
      MAX_MODEL_MAX_RETRIES,
    ),
    timeoutMs: readNonNegativeInt(env, "MODEL_TIMEOUT_MS", 120_000),
    chunkTimeoutMs: readNonNegativeInt(env, "MODEL_CHUNK_TIMEOUT_MS", 30_000),
    contextWindowTokens: readPositiveInt(env, "MODEL_CONTEXT_WINDOW_TOKENS", 180_000),
    outputReserveTokens: readPositiveInt(env, "MODEL_OUTPUT_RESERVE_TOKENS", 16_000),
    maxConversationTurns: readPositiveInt(
      env,
      "MODEL_MAX_CONVERSATION_TURNS",
      DEFAULT_MAX_CONVERSATION_TURNS,
    ),
    maxUserInputTokens: readPositiveInt(
      env,
      "MODEL_MAX_USER_INPUT_TOKENS",
      DEFAULT_MAX_USER_INPUT_TOKENS,
    ),
    toolResultBudgetTokens: readPositiveInt(
      env,
      "MODEL_TOOL_RESULT_BUDGET_TOKENS",
      DEFAULT_TOOL_RESULT_BUDGET_TOKENS,
    ),
    toolResultMaxTokens: readPositiveInt(
      env,
      "MODEL_TOOL_RESULT_MAX_TOKENS",
      DEFAULT_TOOL_RESULT_MAX_TOKENS,
    ),
    readSheetDataBudgetTokens: readPositiveInt(
      env,
      "MODEL_READ_SHEET_DATA_BUDGET_TOKENS",
      DEFAULT_READ_SHEET_DATA_BUDGET_TOKENS,
    ),
  };
}

export function loadModelConfig(): ModelConfig {
  if (cachedConfig) return cachedConfig;

  cachedConfig = createModelConfig(process.env);
  console.log(`[config] Loaded model config: ${cachedConfig.modelName} @ ${cachedConfig.baseUrl}`);
  return cachedConfig;
}
