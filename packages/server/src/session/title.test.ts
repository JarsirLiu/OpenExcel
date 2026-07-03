import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateText = vi.fn();
const mockCreateTitleModel = vi.fn();
const mockFindSession = vi.fn();
const mockUpdateSession = vi.fn();
const mockLoadModelConfig = vi.fn();

vi.mock("ai", () => ({
  generateText: mockGenerateText,
}));

vi.mock("@openexcel/agent", () => ({
  createTitleModel: mockCreateTitleModel,
}));

vi.mock("./repository.js", () => ({
  findSession: mockFindSession,
  updateSession: mockUpdateSession,
}));

vi.mock("../config.js", () => ({
  loadModelConfig: mockLoadModelConfig,
}));

const { generateSessionTitleForSession, generateTitle } = await import("./title.js");

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateTitleModel.mockReturnValue("title-model");
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

    expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
      model: "title-model",
      prompt: expect.stringContaining("分析这些数据"),
      maxOutputTokens: 32,
      temperature: 0,
    }));
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
    });

    const title = await generateSessionTitleForSession(1, "分析这些数据");

    expect(mockCreateTitleModel).toHaveBeenCalledWith({
      baseUrl: "http://test.local",
      apiKey: "test-key",
      modelName: "test-model",
    });
    expect(mockUpdateSession).toHaveBeenCalledWith(1, { name: "数据分析" });
    expect(title).toBe("数据分析");
  });

  it("已有标题时直接返回", async () => {
    mockFindSession.mockResolvedValue({
      id: 1,
      name: "已有标题",
    });

    const title = await generateSessionTitleForSession(1, "分析这些数据");

    expect(title).toBe("已有标题");
    expect(mockGenerateText).not.toHaveBeenCalled();
    expect(mockUpdateSession).not.toHaveBeenCalled();
  });
});
