import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGenerateText = vi.fn();
const mockCreateTitleModel = vi.fn();

vi.mock("ai", () => ({
  generateText: mockGenerateText,
}));

vi.mock("../model.js", () => ({
  createTitleModel: mockCreateTitleModel,
}));

const { generateSessionTitle, generateTitle } = await import("./title.js");

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateTitleModel.mockReturnValue("title-model");
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

describe("generateSessionTitle", () => {
  it("调用标题模型工厂并持久化结果", async () => {
    mockGenerateText.mockResolvedValue({
      text: "数据分析",
    });

    const updateSession = vi.fn();
    const title = await generateSessionTitle(
      updateSession,
      1,
      "分析这些数据",
      {
        baseUrl: "http://test.local",
        apiKey: "test-key",
        modelName: "test-model",
      },
    );

    expect(mockCreateTitleModel).toHaveBeenCalledWith({
      baseUrl: "http://test.local",
      apiKey: "test-key",
      modelName: "test-model",
    });
    expect(updateSession).toHaveBeenCalledWith(1, { name: "数据分析" });
    expect(title).toBe("数据分析");
  });
});
