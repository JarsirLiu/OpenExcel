# Agent 可复用包设计

本文档定义 OpenExcel Agent 内核未来如何作为通用 TypeScript 包复用。目标不是把
OpenExcel 的 workbook 业务打包出去，而是把模型循环、工具协议、上下文预算、自动压缩和
事件生命周期整理成可注入的 runtime。

当前 `packages/agent` 仍是 OpenExcel 内部包。本文档描述目标公开 API，暂不代表代码已经完成。

## 1. 目标形态

推荐先在一个仓库内按模块拆分，API 稳定后再决定是否拆成多个 npm 包：

```text
packages/agent
├── src/core/                 # 与具体模型 SDK 无关的 Agent 内核
│   ├── context/              # token budget、预测、safe boundary、compaction
│   ├── runtime/              # Agent 状态机、步骤、取消、retry
│   ├── messages/             # 通用消息和工具调用结构
│   └── events/               # provider-neutral 事件
├── src/adapters/ai-sdk/      # Vercel AI SDK 适配器
├── src/adapters/models/      # provider/model 适配器
└── src/index.ts              # 稳定公开入口
```

OpenExcel 的 prompt、workspace context、Excel tools 和 Prisma repository 由调用方组合，
不要成为通用内核的必选依赖。

## 2. 内核需要的抽象

```ts
interface ModelAdapter {
  stream(input: ModelRequest, options?: {
    signal?: AbortSignal;
    onStepFinished?: (event: ModelStepFinished) => void | Promise<void>;
  }): Promise<ModelResponse>;
}

interface ToolExecutor<TContext = unknown> {
  execute(request: ToolExecutionRequest<TContext>): Promise<unknown>;
}

interface TokenEstimator {
  estimate(value: unknown): number;
}

interface SummaryGenerator {
  generate(input: SummaryInput, options?: {
    signal?: AbortSignal;
  }): Promise<ContextSummary>;
}
```

上下文压缩引擎再通过 `ContextCheckpointStore`、`AgentEventSink` 和
`PersistenceBarrier` 接入调用方的存储及事件系统。内核不需要知道这些端口背后的数据库或
网络协议。

## 3. 稳定公开 API

公开 API 应优先提供这些能力：

- `createAgentRuntime(options)`：创建一次可取消、可观测的 Agent runtime；
- `AgentRuntime.run(input)`：执行当前 user turn；
- `ContextBudgetPlanner`：根据真实 usage 和估算增量预测预算；
- `CompactionEngine`：执行摘要、checkpoint 和 overflow recovery；
- `ToolDefinition`、`ToolExecutor`：描述和执行通用工具；
- `AgentEvent`、`AgentEventSink`：向 HTTP、CLI、队列或 UI 适配事件；
- `ContextCheckpointStore`：接入内存、文件、Redis 或数据库；
- `TokenEstimator`、`SummaryGenerator`：允许项目替换 tokenizer 和摘要模型调用。

公共类型应使用明确的 discriminated union，不以 `Record<string, unknown>` 作为所有消息的
长期类型。模型 SDK 特有的类型只出现在 adapter 入口，不泄漏到 core contract。

## 4. OpenExcel 适配方式

OpenExcel 调用通用 runtime 时提供：

- 已授权的 workspace context provider；
- 从 `packages/core` 派生的工具定义；
- Server-owned tool executor；
- AgentEvent persistence barrier；
- Prisma-backed context checkpoint store；
- workbook/sheet revision 作为 `externalContextRevision`；
- OpenExcel 的 system prompt builder。

其他项目可以替换为代码仓库、文档库、客服知识库或游戏状态，而不需要修改 compaction engine。

## 5. 模型 SDK 适配

Vercel AI SDK 可以继续作为 OpenExcel 的默认执行适配器，但不能成为 core 的领域模型：

- `streamText`、`generateText` 和 SDK 的 UI message 类型只出现在 `src/adapters/ai-sdk/`；
- provider 返回的 usage 在 adapter 中转换为统一 `ModelStepUsage`；
- core 只接收标准化 token usage、消息、工具调用和生命周期事件；
- 压缩默认复用当前 chat model，不在 core contract 中固定 `compactionModelName`；
- 如果未来允许独立摘要模型，由调用方注入 `SummaryGenerator`，而不是扩散到 `ModelConfig`。

## 6. 发布前检查

在标记为可复用包前，需要完成：

1. 将 package 入口从源码改为构建产物，并生成 `.d.ts`；
2. 明确根入口和可选 adapter 子路径的 exports；
3. 移除 core 对 Fastify、Prisma、React、Excel 类型和 OpenExcel prompt 的依赖；
4. 为真实 usage、估算修正、safe boundary、checkpoint CAS 和 overflow recovery 添加纯测试；
5. 用内存 store 和 mock model 验证包可以脱离 OpenExcel server 运行；
6. 只从 `src/index.ts` 暴露稳定 API，内部模块保持可替换。

## 7. 推荐迁移顺序

1. 先把上下文压缩的纯算法和 contract 放入 `src/core/context/`；
2. 将当前 AI SDK 调用移动到 adapter，保留现有行为；
3. 将 OpenExcel 的 workspace、prompt 和 Excel tool 组合移到调用方；
4. 删除旧的按轮数 compaction API 和 `any` 回调；
5. 通过 package-level tests 固化公开 API；
6. 最后再决定继续单包发布，还是拆成 `agent-core` 与 `agent-ai-sdk`。
