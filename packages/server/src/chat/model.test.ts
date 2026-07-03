import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLoadModelConfig = vi.fn();
const mockChat = vi.fn();
const mockCompletion = vi.fn();
const mockCreateOpenAI = vi.fn(() => ({
  chat: mockChat,
  completion: mockCompletion,
}));

vi.mock("ai", () => ({
  isLoopFinished: vi.fn(),
  streamText: vi.fn(),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: mockCreateOpenAI,
}));

vi.mock("../config.js", () => ({
  loadModelConfig: mockLoadModelConfig,
}));

const ai = await import("ai");
const { createChatModel, createTitleModel, streamChat } = await import("./model.js");

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadModelConfig.mockReturnValue({
    baseUrl: "http://test.local",
    apiKey: "test-key",
    modelName: "test-model",
  });
  mockChat.mockReturnValue("chat-model");
  mockCompletion.mockReturnValue("title-model");
});

describe("model factory", () => {
  it("creates a chat model for streaming chat", () => {
    const model = createChatModel();

    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      baseURL: "http://test.local",
      apiKey: "test-key",
    });
    expect(mockChat).toHaveBeenCalledWith("test-model");
    expect(model).toBe("chat-model");
  });

  it("creates a completion model for title generation", () => {
    const model = createTitleModel();

    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      baseURL: "http://test.local",
      apiKey: "test-key",
    });
    expect(mockCompletion).toHaveBeenCalledWith("test-model");
    expect(model).toBe("title-model");
  });

  it("streamChat uses the chat model boundary", () => {
    vi.mocked(ai.streamText).mockReturnValue("stream-result" as never);
    streamChat({
      systemPrompt: "system",
      messages: [],
      tools: {},
    });

    expect(ai.streamText).toHaveBeenCalledWith(expect.objectContaining({ model: "chat-model" }));
  });
});
