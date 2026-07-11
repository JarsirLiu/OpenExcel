import "dotenv/config";

export interface ModelConfig {
  baseUrl: string;
  apiKey: string;
  modelName: string;
}

let cachedConfig: ModelConfig | null = null;

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
  };
  console.log(`[config] Loaded model config: ${modelName} @ ${baseUrl}`);
  return cachedConfig;
}
