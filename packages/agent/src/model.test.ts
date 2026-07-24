import { beforeEach, describe, expect, it, vi } from "vitest";

const mockChat = vi.fn();
const mockCreateOpenAICompatible = vi.fn(() => ({
  chatModel: mockChat,
}));

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: mockCreateOpenAICompatible,
}));

const { createChatModel, resolveModelForPurpose, createMockModel } = await import("./model.js");

beforeEach(() => {
  vi.clearAllMocks();
  mockChat.mockReturnValue("chat-model");
});

describe("agent model factory", () => {
  it("creates a chat model", () => {
    const model = createChatModel({
      baseUrl: "http://test.local",
      apiKey: "test-key",
      modelName: "test-model",
    });

    expect(mockCreateOpenAICompatible).toHaveBeenCalledWith({
      name: "openexcel",
      baseURL: "http://test.local",
      apiKey: "test-key",
      includeUsage: true,
    });
    expect(mockChat).toHaveBeenCalledWith("test-model");
    expect(model).toBe("chat-model");
  });
});

describe("model resolver", () => {
  it("resolves chat model by default", () => {
    const model = resolveModelForPurpose(
      { baseUrl: "http://test.local", apiKey: "test-key", modelName: "test-model" },
      "chat",
    );

    expect(mockChat).toHaveBeenCalledWith("test-model");
    expect(model).toBe("chat-model");
  });

  it("resolves compaction model when configured", () => {
    const model = resolveModelForPurpose(
      {
        baseUrl: "http://test.local",
        apiKey: "test-key",
        modelName: "test-model",
        compactionModelName: "compact-model",
      },
      "compaction",
    );

    expect(mockChat).toHaveBeenCalledWith("compact-model");
    expect(model).toBe("chat-model");
  });

  it("falls back to chat model when compaction model not configured", () => {
    const model = resolveModelForPurpose(
      { baseUrl: "http://test.local", apiKey: "test-key", modelName: "test-model" },
      "compaction",
    );

    expect(mockChat).toHaveBeenCalledWith("test-model");
    expect(model).toBe("chat-model");
  });
});

describe("mock model", () => {
  it("creates a mock model", async () => {
    const model = createMockModel({ responses: [{ text: "hello" }] });

    const result = await model.streamText({ messages: [] });
    const chunks: string[] = [];
    for await (const chunk of result.stream) {
      if (typeof chunk === "object" && "text" in chunk) {
        chunks.push(chunk.text);
      }
    }
    expect(chunks.join("")).toBe("hello");
  });

  it("supports response factory", async () => {
    const model = createMockModel({
      responseFactory: () => ({ text: "factory response" }),
    });

    const result = await model.streamText({ messages: [] });
    const chunks: string[] = [];
    for await (const chunk of result.stream) {
      if (typeof chunk === "object" && "text" in chunk) {
        chunks.push(chunk.text);
      }
    }
    expect(chunks.join("")).toBe("factory response");
  });
});
