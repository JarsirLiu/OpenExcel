export type ModelPurpose = "chat" | "title";

export interface RuntimeModelReference {
  modelName: string;
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface ModelSelectionStrategy {
  resolveModelForPurpose(purpose: ModelPurpose): RuntimeModelReference;
}

export interface ModelConfig {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  titleModelName?: string;
}
