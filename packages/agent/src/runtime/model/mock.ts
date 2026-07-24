import type { ToolSet, UIMessage } from "ai";

export interface MockModelResponse {
  text: string;
  toolCalls?: Array<{ toolName: string; arguments: Record<string, unknown> }>;
  finishReason?: string;
}

export interface MockModelConfig {
  responses?: MockModelResponse[];
  responseFactory?: (
    messages: UIMessage[],
    tools?: ToolSet,
  ) => MockModelResponse | Promise<MockModelResponse>;
  latencyMs?: number;
}

export function createMockModel(config: MockModelConfig = {}) {
  let responseIndex = 0;

  return {
    streamText: async ({ messages, tools }: any) => {
      await new Promise((resolve) => setTimeout(resolve, config.latencyMs ?? 50));

      const response =
        config.responseFactory != null
          ? await config.responseFactory(messages, tools)
          : (config.responses?.[responseIndex++] ?? { text: "Mock response" });

      const chunks: Array<{ type: "text"; text: string }> = response.text.split("").map((char) => ({
        type: "text" as const,
        text: char,
      }));

      const stream = new ReadableStream({
        async start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          controller.close();
        },
      });

      return {
        stream,
        text: Promise.resolve(response.text),
        usage: {
          promptTokens: 100,
          completionTokens: response.text.length,
          totalTokens: 100 + response.text.length,
        },
      };
    },

    get modelInfo() {
      return {
        modelName: "mock-model",
        provider: "mock",
      };
    },
  };
}

export function createFixedResponseModel(text: string) {
  return createMockModel({
    responseFactory: () => ({ text }),
  });
}
