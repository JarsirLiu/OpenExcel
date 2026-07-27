# Agent 上下文策略：自动压缩与窗口滑动

本文档定义 Agent 如何预测模型上下文、选择安全消息边界、执行自动压缩以及恢复
context checkpoint。它只影响模型请求看到的 model context，不改变 canonical
transcript、AgentEvent、工具账本、外部业务状态或前端历史消息。

当前状态：自动 `compaction` 已接入 `agentLoop` 的模型步骤生命周期；`sliding-window` 仍是显式策略
的设计预留，当前不会在压缩失败时自动切换。当前实现包括：

- `runtime/context/transcript.ts`：跨运行单调 transcript cursor；
- `runtime/context/compaction/budgetPlanner.ts`：普通请求预算、摘要请求预算和触发阈值；
- `runtime/context/compaction/safeBoundary.ts`：按完整 user-led turn 选择 recent tail，禁止拆开工具链；
- `runtime/context/compaction/summaryBatchPlanner.ts`：按完整 turn 拆分摘要输入；
- `runtime/context/compaction/summary.ts`：严格结构化摘要 schema 和 token 上限校验；
- `runtime/context/compaction/modelSummary.ts`：复用当前 chat model 的结构化摘要适配器；
- `runtime/context/compaction/engine.ts`：增量摘要、context 重建、checkpoint CAS 和 external revision 失效；
- `runtime/context/modelContextAssembler.ts`：把摘要组装成仅供模型使用的特殊 user context message，不伪装成
  canonical transcript 消息，也不提升为 system prompt。
- `runtime/context/contextCompactionCoordinator.ts`：协调步骤完成、预算判断、压缩后上下文重建和 token baseline 重置；
- server `checkpointRepository.ts`：为 session/run 提供 checkpoint 读取和版本 CAS 保存。

`runAgentLoop` 在 `prepareStep` 前根据上一阶段 provider usage 和当前实际 messages、instructions、
activeTools 预测下一次输入；达到阈值后由 coordinator 生成摘要、CAS 保存 checkpoint 并重建下一步
model context。provider context overflow 走独立的有限 compact-and-retry 路径。实现必须以本文档为准，
不得恢复旧的按消息数量压缩占位实现。

## 1. 目标

Agent 支持两种上下文策略：

- `compaction`：当前启用的策略。接近上下文上限时，使用当前对话模型生成结构化摘要，并保留
  最近安全消息；
- `sliding-window`：设计预留。尚未接入运行时，不能作为压缩失败后的隐式兜底。

两种策略共享 token 观测、增量估算、工具结果预算和消息结构校验。它们不改变外部消息
协议，也不删除服务端完整历史。

压缩模块只接收通用消息、实际生效的 `systemPrompt/toolDefinitions`、摘要模型端口和
checkpoint store；它不依赖 Excel、HTTP、Prisma 或 React。工具定义必须来自当前模型步骤，
不能在压缩模块中重新读取一份静态工具目录。

必须满足：

1. 完整历史是事实源，压缩只改变本次模型请求的输入。
2. provider 返回的真实 token usage 优先；真实 usage 不完整时，使用增量估算预测下一次请求。
3. tool call、tool result 和未完成步骤不能被裁剪成孤立消息。
4. 摘要是模型上下文缓存，不是用户可见的 assistant transcript，也不是业务数据事实源。
5. 压缩失败必须真实失败，不能生成假摘要，也不能在运行中静默切换策略。

## 2. 策略配置

策略配置使用 token 预算，不把保留多少轮作为硬约束：

```ts
type ContextPolicy = {
  mode: "compaction" | "sliding-window";
  triggerRatio: number;
  safetyMarginTokens: number;
  outputReserveTokens: number;
  summaryMaxTokens: number;
  keepRecentTokens: number;
  maxRecentTurns?: number;
  maxCompactionRetries: number;
};
```

推荐初始值：

```ts
{
  mode: "compaction",
  triggerRatio: 0.85,
  safetyMarginTokens: 1024,
  outputReserveTokens: 16_000,
  summaryMaxTokens: 2048,
  keepRecentTokens: 20_000,
  maxCompactionRetries: 1,
}
```

`maxRecentTurns` 只能作为保留上限，不能代替 token 预算。具体默认值必须根据目标模型的
上下文大小、工具定义大小和真实工具结果规模验证后调整。

普通模型请求的可用输入预算：

```text
regularInputBudget = contextWindowTokens
                    - outputReserveTokens
                    - safetyMarginTokens
```

摘要请求的可用输入预算为：

```text
summaryInputBudget = contextWindowTokens
                    - summaryMaxTokens
                    - safetyMarginTokens
```

摘要批处理器会对每个批次重新计算 `previousSummary + 当前 batch`，保证单次摘要请求不超过
`summaryInputBudget`。普通模型的自动压缩阈值由 `regularInputBudget * triggerRatio` 决定。

## 3. 三类数据

### 3.1 Canonical transcript

由服务端 AgentEvent 和 checkpoint projector 生成的完整会话历史，用于历史展示、审计和恢复。
它永远不因上下文压缩或窗口滑动而删除，也不接受浏览器提交的本地历史覆盖。

### 3.2 Context checkpoint

模型上下文缓存，单独持久化，不复用运行恢复用的 `AgentRunCheckpoint`。

checkpoint 只表示“摘要覆盖到哪个 transcript 游标”，不是另一份 transcript。最近保留消息
通过游标从 canonical transcript 重新构造，避免 checkpoint 同时保存一份容易过期的消息副本。

canonical projector 为每条消息分配跨运行递增的游标：

```ts
type ContextTranscriptEntry = {
  cursor: number;
  message: unknown;
};
```

建议结构：

```ts
type ContextCheckpoint = {
  schemaVersion: number;
  checkpointId: string;
  contextKey: string;
  version: number;
  coveredTranscriptCursor: number;
  summaryVersion: number;
  summary: ContextSummary;
  sourceTranscriptHash: string;
  externalContextRevision?: string;
  sourceRunId?: string;
  createdAt: string;
  updatedAt: string;
};
```

`externalContextRevision` 使用不透明字符串。OpenExcel 可以将它绑定到 workbook/sheet
revision，其他项目可以绑定文档版本、代码仓库状态或自己的领域版本。

### 3.3 Model context

每次模型步骤临时组装：

```text
system prompt
+ 特殊 user context message：context checkpoint summary（如果存在）
+ checkpoint 之后的最近安全消息
+ 当前模型步骤需要的工具定义和工具结果
```

model context 不能写回 canonical transcript，也不能被前端提交回来作为下一轮历史。

## 4. Token 观测与预测

### 4.1 真实 usage 优先

模型适配器必须在每个模型步骤完成后回调标准化 usage。回调发生在模型响应可用之后，
并且要早于下一次模型步骤的预算判断：

```ts
type ModelStepUsage = {
  inputTokens: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  reasoningTokens?: number;
  source: "provider";
};

type ModelStepFinished = {
  stepIndex: number;
  usage?: ModelStepUsage;
  finishReason: string;
};
```

AI SDK step 的实际上下文由生命周期回调提供：`onStepStart` 的 `messages`、`instructions` 和
`activeTools` 用于预测当前请求；`onStepFinish` 的 `request.messages` 用于校准本次 provider
usage 的 baseline。不能把 `step.content` 与 `step.toolResults` 手工追加到上下文，它们可能已经
被 SDK 转换为 response messages，重复追加会改变消息结构并重复计算工具结果。

provider 适配器负责把不同供应商的字段标准化。`inputTokens` 必须表示本次请求实际消耗的
有效输入 token；如果供应商同时返回普通输入和 cache-read 输入，适配器必须先确认它们是否
已经包含在总输入中，不能在 Agent 内核中简单相加造成重复计算。

上下文预算主要使用 `inputTokens`。`outputTokens` 用于成本和观测，下一次请求的输出空间由
`outputReserveTokens` 单独预留。

### 4.2 增量估算

真实 usage 只覆盖已经完成的模型请求。两次 usage 回调之间新增的消息、工具结果、工具定义
或 prompt 变化，使用 provider-independent estimator 估算：

```text
predictedInputTokens
  = lastConfirmedInputTokens
  + estimate(messagesSinceLastUsage)
  + estimate(changedSystemPrompt)
  + estimate(changedToolDefinitions)
  + estimate(pendingToolResults)
```

如果当前会话还没有真实 usage，则对完整的待发送 model context 估算。估算器必须计算：

- role、message、part 和 tool-call 的结构开销；
- 文本、JSON、数组和二维表格数据；
- system prompt 和工具定义；
- 压缩 prompt、previous summary 和摘要输出预留；
- 工具结果预算截断后的最终内容，而不是截断前的原始结果。

估算器可以使用可选的 provider tokenizer；没有 tokenizer 时使用稳定、偏保守的通用估算。
估算规则必须可注入，便于其他项目替换，不得把某个模型的 tokenizer 写死在 compaction engine。

### 4.3 预测置信度和基线重置

每次预算判断都记录观测来源：

```ts
type TokenObservation = {
  inputTokens: number;
  source: "provider" | "estimate" | "mixed";
  measuredAtStep?: number;
};
```

规则如下：

1. 有当前模型回调 usage 时，以 provider usage 作为新的 confirmed baseline。
2. 没有回调 usage 时，从最近一次 confirmed baseline 加估算增量。
3. 压缩 checkpoint 成功后，旧 checkpoint 之前的 usage 不能继续作为新上下文的基线。
4. 第一个压缩后的普通模型响应到达前，预测只能标记为 `estimate` 或 `mixed`。
5. 旧模型、旧分支或压缩前响应晚到时，不得覆盖压缩后的新 baseline。
6. 观测值仅用于预算、成本和诊断，不写入 canonical transcript。

如果 provider 报告的实际 input usage 高于预测值，下一次判断立即使用真实值修正，不等待
下一轮累计误差。

## 5. 安全消息边界

上下文选择的最小单位是完整模型步骤或完整对话轮次，而不是单个数组元素。典型完整结构：

```text
user message
assistant tool-call
tool result / tool error
assistant text or next tool-call
```

压缩和窗口滑动都禁止：

- 只保留 tool call，删除对应 tool result；
- 只保留 tool result，删除对应 tool call；
- 删除 assistant 内容的一部分导致消息结构失真；
- 对二维表格结果随机删行或拼接头尾；
- 把未完成工具调用当作已完成历史；
- 把压缩摘要伪装成普通 assistant 消息。

工具结果先经过统一 `ToolResultBudget`，大范围表格读取必须使用工具自身的分页和连续范围
语义。上下文策略只处理已经合法且可预算的工具结果。

如果当前 user turn 本身超过模型可接受的上限：

- 能按完整轮次切分时，保留最近 suffix，并为被移除的 prefix 单独生成 turn-prefix summary；
- 不能安全切分时，在请求边界明确失败；
- 任何情况下都不能静默截断用户输入或破坏工具调用链。

## 6. 自动压缩流程

`compaction` 在模型步骤边界运行：

1. 当前模型步骤和所有工具步骤完成。
2. 工具副作用、工具账本、工具结果和 AgentEvent 经过 persistence barrier 确认。
3. 记录本步骤 provider usage，并计算下一次请求的 predicted input tokens。
4. 未达到 `compactBefore` 时，继续组装下一步 model context。
5. 达到阈值时，从最新安全边界向前选择要保留的 recent tail。
6. 将被移除的历史与 `previousSummary` 交给当前 chat model 生成结构化摘要。
7. 校验摘要 schema、摘要 token 数量和覆盖游标。
8. 使用 checkpoint store 以乐观版本写入新的 context checkpoint。
9. checkpoint 写入成功后，重建下一次 model context，并重置旧 token baseline。

压缩摘要不是一次普通对话消息。摘要生成失败、checkpoint 保存失败或压缩后仍然超限时，
都必须终止当前运行并返回真实失败阶段。

### 6.1 摘要结构

摘要使用版本化结构，不依赖某个项目的自然语言格式：

```ts
type ContextSummary = {
  goal: string[];
  constraints: string[];
  completed: string[];
  inProgress: string[];
  blocked: string[];
  decisions: Array<{ decision: string; reason?: string }>;
  nextSteps: string[];
  criticalFacts: string[];
  references: Array<{ label: string; value: string }>;
};
```

模型必须输出可校验的结构化结果。摘要生成器负责解析、校验和限制每个字段的长度；不合格
结果视为压缩失败，不使用模型原始文本兜底。

摘要生成直接复用当前运行已经解析出的 chat model，不新增 `summaryModel` 配置。摘要请求
不携带 Excel tools，使用独立 system prompt、`Output.object` 结构化输出和当前运行的
AbortSignal。摘要 usage 单独上报，不覆盖普通模型的 token baseline。

再次压缩时：

- 旧摘要作为 `previousSummary` 独立输入；
- 摘要源只取 `cursor > checkpoint.coveredTranscriptCursor` 的新增 transcript；
- 新 checkpoint 的 `coveredTranscriptCursor` 必须单调递增；
- 不把旧摘要当普通 transcript 再次截断。

## 7. Context overflow 恢复

即使预测正确，provider 仍可能因为 tokenizer 差异、隐藏 prompt 或供应商限制返回 context
overflow。处理规则：

1. 识别为 `context_overflow`，而不是普通模型重试。
2. 移除未持久化的失败模型响应，不把错误消息加入 canonical transcript。
3. 当前运行最多执行一次 `compact-and-retry`。
4. retry 前重新读取最新 checkpoint 和 canonical transcript，重新计算 token 预算。
5. retry 后仍 overflow，进入 `context_budget` 失败状态。
6. 同一压缩边界不能重复触发压缩，避免死循环。

压缩调用本身可以使用普通的 transient retry/backoff，但必须受独立的压缩重试次数限制，
并共享 AbortSignal。取消、进程退出和 checkpoint 保存失败都不能被普通模型 retry 掩盖。

## 8. 窗口滑动模式

`sliding-window` 使用相同的 token 观测、估算和安全边界，但不调用摘要模型：

1. 从最新完整安全边界向前选择消息；
2. 直到达到历史输入预算；
3. 只从本次 model context 移除超出的旧消息；
4. canonical transcript、AgentEvent 和 context checkpoint 不变。

窗口滑动不会生成“历史已压缩”的假消息，也不会修改数据库 transcript。它只能由配置显式
启用，压缩失败时不能在运行中自动静默切换。

## 9. Checkpoint 持久化与恢复

压缩引擎只依赖抽象 store。store 必须支持版本条件写入，而不是无条件覆盖：

```ts
interface ContextCheckpointStore {
  load(contextKey: string): Promise<ContextCheckpoint | null>;

  save(input: {
    checkpoint: ContextCheckpoint;
    expectedVersion: number | null;
  }): Promise<{
    accepted: boolean;
    current?: ContextCheckpoint;
  }>;

}
```

`save` 返回 `accepted: false` 时，运行必须重新加载最新 checkpoint 和 transcript 后再决定
是否继续，不能覆盖其他 run 已提交的摘要。external context revision 变化时不执行独立删除，
而是丢弃旧 summary，并以当前 checkpoint version 作为一次 CAS 保存的新版本基线。checkpoint
失效原因至少包括：

- external context revision 变化；
- undo、导入或批量外部修改；
- transcript 游标不连续；
- schema 版本不兼容；
- 检测到摘要损坏。

进程退出时：

- checkpoint 已提交：新运行可以继续使用；
- checkpoint 尚未提交：从旧 checkpoint 和 canonical transcript 重新计算；
- 摘要已生成但 checkpoint 保存失败：进入可诊断的 persistence/recovery 状态，不静默继续。

业务数据库状态始终优先于摘要中的描述。OpenExcel 将 `externalContextRevision` 绑定到
workbook/sheet revision，其他项目可以绑定自己的外部状态版本。

## 10. 可复用包契约

上下文压缩应作为通用 Agent runtime 的一部分实现，而不是 Excel session 的专用逻辑。可复用
包只需要抽象的模型、消息、工具、事件和 checkpoint 接口；项目自身负责提供 prompt、上下文
数据、工具实现和持久化适配。完整包拆分方案见
[Agent 可复用包设计](agent-core-package.md)。

内核至少提供：

- `ContextBudgetPlanner`：真实 usage + 增量估算 + 阈值预测；
- `SafeBoundarySelector`：消息/工具调用安全边界；
- `CompactionEngine`：摘要准备、结构校验、previous summary 和 retry guard；
- `ContextCheckpointStore`：外部持久化端口；
- provider-neutral `compaction.started/completed/failed` 事件；
- 可注入 `TokenEstimator`、`SummaryGenerator` 和 `Clock`，便于测试和不同项目适配。

内核不应要求调用方提供 Excel workbook、sheet、HTTP request、Prisma 或浏览器消息。OpenExcel
的工作簿上下文、工具目录和数据库 checkpoint 通过适配器注入。

## 11. 事件与失败

建议事件：

```text
compaction.started
compaction.completed
compaction.failed
context.overflow
```

事件只携带策略、预测 token、实际 token（如果有）、覆盖游标、保留窗口、摘要版本和失败阶段
等元数据，不把摘要渲染成 assistant 消息。

失败阶段至少区分：

- `usage`：provider usage 不可解析或不合法；
- `compaction`：摘要模型调用失败；
- `checkpoint`：checkpoint 版本冲突或持久化失败；
- `context_budget`：压缩后仍然超出模型预算；
- `recovery`：overflow retry 或进程恢复失败。

## 12. 模块归属

可复用 Agent 内核负责：

- token usage 标准化接口和增量估算；
- token budget、阈值预测和安全边界；
- 摘要 prompt/schema 的通用编排；
- current model 的压缩调用；
- context checkpoint store 端口；
- provider-neutral 生命周期事件。

OpenExcel 适配层负责：

- workbook/sheet context revision；
- Server/Prisma checkpoint repository；
- AgentEvent persistence barrier 和 run finalizer；
- Excel 工具执行和工具结果分页；
- HTTP/NDJSON 和前端历史投影。

## 13. 实施顺序与验收

实施顺序：

1. 删除旧的按消息数量压缩实现，使用 `ContextCompactionPolicy`；
2. 定义标准 `ModelStepFinished.usage` 和可注入 `TokenEstimator`；
3. 实现纯 token budget、真实 usage 基线和增量预测；
4. 实现 safe boundary、sliding-window 和 oversized-turn 处理；
5. ~~实现 `CompactionEngine`、结构化 summary 和 overflow 一次恢复~~：已完成 engine、summary
   校验、CAS checkpoint、external revision 失效和有限 overflow recovery；
6. ~~实现 CAS checkpoint store 和 external revision 失效~~：已完成 runtime store port 与 server
   Prisma adapter；
7. ~~接入模型步骤边界、persistence barrier 和 AgentEvent~~：已由 coordinator 接入 loop，
   server 继续以既有 durable event barrier 作为持久化边界；
8. 默认启用 `compaction`；`sliding-window` 仍是显式策略预留，不作为压缩失败后的隐式兜底；
9. 将内核 API 从 OpenExcel 专用字段中抽离，按 [Agent 可复用包设计](agent-core-package.md)整理公开入口。

验收必须覆盖：

- provider usage 到达后会修正此前的估算值；
- 没有 provider usage 时仍能稳定预测下一次请求；
- 压缩后不会使用压缩前的 stale usage 再次触发压缩；
- 工具调用链不会出现孤立 tool call 或 tool result；
- oversized turn 不会静默截断用户输入；
- sliding-window 不调用摘要模型；
- compaction 失败不会伪造成功或静默切换策略；
- overflow 最多只 compact-and-retry 一次；
- 摘要 schema、摘要 token 和 covered sequence 都经过校验；
- checkpoint 版本冲突不会覆盖其他 run 的摘要；
- external revision 变化后不会使用旧 checkpoint；
- 摘要生成、checkpoint 保存和下一步模型调用各阶段进程退出都可诊断恢复；
- 压缩前后历史接口不出现摘要 assistant 消息，实时事件和历史投影保持一致。
