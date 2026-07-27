import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateText = vi.fn();
const mockResolveModelForPurpose = vi.fn();
const mockFindSession = vi.fn();
const mockFindFirstSessionRunInputText = vi.fn();
const mockUpdateSession = vi.fn();
const mockUpdateSessionNameIfUnchanged = vi.fn();
const mockLoadModelConfig = vi.fn();

vi.mock("ai", () => ({
  generateText: mockGenerateText,
}));

vi.mock("@openexcel/agent", () => ({
  resolveModelForPurpose: mockResolveModelForPurpose,
}));

vi.mock("../infrastructure/sessionRepository.js", () => ({
  findSession: mockFindSession,
  updateSession: mockUpdateSession,
  updateSessionNameIfUnchanged: mockUpdateSessionNameIfUnchanged,
}));

vi.mock("../runs/repository.js", () => ({
  findFirstSessionRunInputText: mockFindFirstSessionRunInputText,
}));

vi.mock("../../../config.js", () => ({
  loadModelConfig: mockLoadModelConfig,
}));

const { generateSessionTitleForSession, generateTitle } = await import("./title.js");

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveModelForPurpose.mockReturnValue("title-model");
  mockUpdateSessionNameIfUnchanged.mockResolvedValue(true);
  mockFindFirstSessionRunInputText.mockResolvedValue("分析这些数据");
  mockLoadModelConfig.mockReturnValue({
    baseUrl: "http://test.local",
    apiKey: "test-key",
    modelName: "test-model",
  });
});

describe("generateTitle", () => {
  it("从标题模型结果中提取正文标题", async () => {
    mockGenerateText.mockResolvedValue({
      text: "<think>推理中</think>\n\n数据分析报告生成",
    });

    const title = await generateTitle("title-model" as any, "分析这些数据");

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "title-model",
        prompt: expect.stringContaining("分析这些数据"),
        maxOutputTokens: 32,
        temperature: 0,
      }),
    );
    expect(title).toBe("数据分析报告生成");
  });

  it("正文为空时回退到用户输入摘要", async () => {
    mockGenerateText.mockResolvedValue({
      text: "   \n <think>只有思考</think> \n",
    });

    const title = await generateTitle("title-model" as any, "这是一段很长的用户输入");

    expect(title).toBe("这是一段很长的用户输");
  });

  it("用户输入也为空时回退为默认标题", async () => {
    mockGenerateText.mockResolvedValue({
      text: "",
    });

    const title = await generateTitle("title-model" as any, "   ");

    expect(title).toBe("新对话");
  });

  it("模型抛错时回退到用户输入前十个字", async () => {
    mockGenerateText.mockRejectedValue(new Error("model failed"));

    const title = await generateTitle("title-model" as any, "请帮我分析这份销售数据并给出结论");

    expect(title).toBe("请帮我分析这份销售数据".slice(0, 10));
  });
});

describe("generateSessionTitleForSession", () => {
  it("调用标题模型工厂并持久化结果", async () => {
    mockGenerateText.mockResolvedValue({
      text: "数据分析",
    });
    mockFindSession.mockResolvedValue({
      id: 1,
      name: "新对话",
      titleStatus: "pending",
    });

    const title = await generateSessionTitleForSession(1, 1);

    expect(mockResolveModelForPurpose).toHaveBeenCalledWith(
      {
        baseUrl: "http://test.local",
        apiKey: "test-key",
        modelName: "test-model",
      },
      "title",
    );
    expect(mockFindFirstSessionRunInputText).toHaveBeenCalledWith(1, 1);
    expect(mockUpdateSessionNameIfUnchanged).toHaveBeenCalledWith(1, 1, ["新对话"], "数据分析");
    expect(title).toBe("数据分析");
  });

  it("已有标题时直接返回", async () => {
    mockFindSession.mockResolvedValue({
      id: 1,
      name: "已有标题",
      titleStatus: "generated",
    });

    const title = await generateSessionTitleForSession(1, 1);

    expect(title).toBe("已有标题");
    expect(mockGenerateText).not.toHaveBeenCalled();
    expect(mockUpdateSession).not.toHaveBeenCalled();
  });

  it("does not replace a manual title", async () => {
    mockFindSession.mockResolvedValue({
      id: 1,
      name: "我的会话",
      titleStatus: "manual",
    });

    const title = await generateSessionTitleForSession(1, 1);

    expect(title).toBe("我的会话");
    expect(mockFindFirstSessionRunInputText).not.toHaveBeenCalled();
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("uses the first persisted run input", async () => {
    mockGenerateText.mockResolvedValue({ text: "数据分析" });
    mockFindSession.mockResolvedValue({ id: 1, name: "新对话", titleStatus: "pending" });
    mockFindFirstSessionRunInputText.mockResolvedValue("首条持久化消息");

    await generateSessionTitleForSession(1, 1);

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: expect.stringContaining("首条持久化消息") }),
    );
  });
});
