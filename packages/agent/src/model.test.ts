import { beforeEach, describe, expect, it, vi } from "vitest";

const mockChat = vi.fn();
const mockCreateOpenAI = vi.fn(() => ({
  chat: mockChat,
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: mockCreateOpenAI,
}));

const { createChatModel, createTitleModel } = await import("./model.js");

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

    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      baseURL: "http://test.local",
      apiKey: "test-key",
    });
    expect(mockChat).toHaveBeenCalledWith("test-model");
    expect(model).toBe("chat-model");
  });

  it("creates the title model through chat completions", () => {
    const model = createTitleModel({
      baseUrl: "http://test.local",
      apiKey: "test-key",
      modelName: "test-model",
    });

    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      baseURL: "http://test.local",
      apiKey: "test-key",
    });
    expect(mockChat).toHaveBeenCalledWith("test-model");
    expect(model).toBe("chat-model");
  });
});
