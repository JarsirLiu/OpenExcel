# Agent 上下文策略：自动压缩与窗口滑动

本文档定义 OpenExcel Agent 的模型上下文管理方案。它只影响模型请求看到的
model context，不改变 AgentEvent、canonical transcript、工具账本、工作簿状态
或前端历史消息。

## 1. 目标与原则

OpenExcel 必须同时支持两种上下文策略：

- `compaction`：默认策略。接近上下文上限时，使用当前对话模型生成摘要，并保留
  最近安全消息；
- `sliding-window`：应急策略。只保留预算内的最近完整消息窗口，不调用摘要模型。

两种策略共享同一套 token 预算、工具结果预算和消息结构校验。它们不是两套消息协议，
也不是前端兼容层。

必须遵守以下原则：

1. 完整历史是服务端事实，不能因为压缩或窗口滑动而删除。
2. 压缩摘要是模型上下文缓存，不是用户可见 transcript，也不是工作簿事实源。
3. 工具调用和工具结果必须在完整安全边界内成对保留，不能产生孤立 tool call。
4. 前端只消费 AgentEvent NDJSON，不参与上下文选择、摘要或恢复。
5. 压缩模型始终复用当前对话模型，不提供独立的压缩模型配置。

## 2. 配置

建议将策略收敛为一个 Agent runtime policy：

```ts
type ContextPolicy = {
  mode: "compaction" | "sliding-window";
  thresholdPercent?: number;
  maxRecentTurns?: number;
  summaryReserveTokens?: number;
  maxSummaryTokens?: number;
};
```

已有的 `contextWindowTokens`、`outputReserveTokens`、`maxUserInputTokens` 和工具结果预算
继续参与最终预算计算。

默认配置使用：

```ts
{
  mode: "compaction",
  thresholdPercent: 0.85,
  maxRecentTurns: 8,
  summaryReserveTokens: 2048,
  maxSummaryTokens: 2048,
}
```

具体默认数值必须由模型上下文大小和实际工具结果规模验证后调整，不能把轮数当作硬保证。

### 2.1 应急切换

当自动压缩出现问题时，通过部署配置将 `mode` 改为 `sliding-window`，重启或重新加载
Agent runtime 后生效。窗口滑动模式不会调用压缩模型，也不会写入新的压缩 checkpoint，
因此可以快速绕过摘要生成、摘要持久化或摘要恢复相关故障。

运行中不能因为压缩失败而静默切换到窗口滑动。压缩失败必须保留真实错误和失败阶段；
是否切换应由运维配置明确决定。这样可以避免同一 run 在不同上下文策略之间无诊断地改变语义。

## 3. 三类数据

Agent 必须区分：

### 3.1 Canonical transcript

由服务端 AgentEvent 和 checkpoint projector 生成的完整会话历史。它用于历史展示、恢复
和审计，永远不受上下文策略影响。

### 3.2 Context checkpoint

会话级模型上下文缓存，建议使用独立的 `SessionContextCheckpoint` 持久化，不复用
`AgentRunCheckpoint`。后者是事件投影和运行恢复读模型，职责不同。

建议字段：

```text
sessionId
version
coveredEventSequence
summaryVersion
summary
sourceTranscriptHash
workspaceRevisionSnapshot
sourceRunId
updatedAt
```

checkpoint 只表示“摘要覆盖到哪个事件”。事件日志仍然是事实源；checkpoint 损坏或失效时，
可以从完整 transcript 重新生成。

### 3.3 Model context

每次模型步骤临时组装的输入，包含：

```text
system prompt
+ context checkpoint summary（如果存在）
+ 最近安全消息
+ 当前模型步骤所需的工具结果
```

它不能写回 canonical transcript，也不能被前端提交回来作为下一轮历史。

## 4. Token 预算

上下文不能按固定“保留几轮”实现。实际历史预算为：

```text
模型上下文上限
- system prompt
- 工具定义
- 输出预留
- 压缩提示预留
- 摘要输出预留
= 历史消息预算
```

预算判断优先使用模型返回的 input token usage；在下一次模型调用前，再对新增消息使用
provider-independent estimate。压缩阈值必须包含压缩提示和摘要输出的固定预留，不能等到
普通模型调用已经超限后才开始压缩。

`maxRecentTurns` 只是上限。Agent 从最新安全边界向前加入完整消息，直到预算不足；实际
保留的轮数可以少于配置值，也可以为零。

如果当前用户输入本身超过模型可接受的上限，不能静默截断。应在请求边界明确失败，或要求
通过文件、工作簿和范围引用让模型按需读取。

## 5. 安全消息边界

上下文选择的最小单位是完整模型步骤或完整对话轮次，而不是单条数组元素。至少必须保持：

```text
user message
assistant tool-call
tool result
assistant text
```

窗口滑动和压缩都禁止：

- 只保留 tool call、删除对应 tool result；
- 只保留 tool result、删除 tool call；
- 删除 assistant 文本的一部分导致消息结构失真；
- 对二维表格结果做随机删行或头尾拼接；
- 把未完成工具调用当成已完成历史。

工具结果首先经过统一 `ToolResultBudget`，大范围 Sheet 读取必须使用工具自身的分页和连续
范围语义。上下文策略只能在已经合法、可预算的模型结果上继续处理。

## 6. 自动压缩模式

`compaction` 模式在模型步骤边界执行：

1. 当前模型步骤完成。
2. 工具副作用、工具账本、工具结果和事件全部持久化确认。
3. Agent 计算下一次模型输入预算。
4. 未超过阈值时，直接继续。
5. 超过阈值时，选择旧消息和最近安全窗口。
6. 使用当前对话模型生成结构化 handoff summary。
7. 校验摘要 schema 和摘要 token 预算。
8. 持久化新的 context checkpoint。
9. 发布 `compaction.completed` 后，组装下一次模型输入并继续。

摘要至少保留：

- 用户目标和未完成事项；
- 已完成工作和关键决策；
- 用户约束和偏好；
- 重要引用、文件路径和稳定 ID；
- 工具调用的成功与失败结果；
- 后续模型继续工作所需的事实。

摘要模型调用使用当前 chat model 的同一模型配置、认证和取消信号，不增加
`compactionModelName` 或其他独立模型入口。AI SDK 只用于内部模型调用，外部仍然是
OpenExcel 自定义 AgentEvent + HTTP/NDJSON 协议。

再次压缩时，旧 checkpoint 必须作为独立 previous checkpoint 传给摘要模型，不能把旧摘要
当普通 transcript 重复截断。新 checkpoint 替换旧 checkpoint，并保持 covered event sequence
单调递增。

## 7. 窗口滑动模式

`sliding-window` 模式使用同一套预算和安全边界，但不调用摘要模型：

1. 从最新完整安全边界向前选择消息。
2. 直到达到历史预算。
3. 超出的旧消息只从本次 model context 移除。
4. canonical transcript、AgentEvent 和历史 checkpoint 不变。

如果最近完整轮次本身超过预算，则只能将该轮作为不可保留的旧上下文处理；当前未完成的
工具步骤不能被窗口滑动中断。窗口滑动模式不生成“历史已压缩”的假消息，也不修改数据库
transcript。

## 8. 持久化与恢复

Agent 通过无数据库依赖的端口使用 checkpoint：

```ts
interface ContextCheckpointPort {
  load(): Promise<ContextCheckpoint | null>;
  persist(checkpoint: ContextCheckpoint): Promise<void>;
  invalidate(reason: string): Promise<void>;
}
```

Server 负责将该端口适配到数据库，并使用乐观版本检查防止旧 run 覆盖新 checkpoint。

checkpoint 必须绑定工作簿上下文版本或 revision snapshot。发生 undo、外部导入、Sheet/Chart
修改或事件边界不连续时，旧 checkpoint 必须失效。工作簿数据库状态永远优先于摘要中的描述。

进程退出时：

- checkpoint 已提交：新 run 可以继续使用它；
- checkpoint 尚未提交：从旧 checkpoint 和 canonical transcript 重新计算；
- 摘要模型已完成但持久化失败：run 进入可诊断的 persistence/recovery 状态，不静默继续。

## 9. 事件与失败

建议增加 provider-neutral AgentEvent：

```text
compaction.started
compaction.completed
```

事件只携带策略、阈值、covered sequence、保留窗口和摘要版本等元数据，不把摘要渲染成
助手消息。

压缩失败必须区分：

- 当前模型的压缩调用失败：`failurePhase = "compaction"`；
- checkpoint 持久化失败：持久化/恢复错误；
- 压缩后模型输入仍然超限：Agent 上下文预算错误。

失败时不得使用 `[对话历史已压缩]` 之类的假摘要，也不得把压缩失败伪装成模型正常完成。
前端只展示后端返回的真实错误。

## 10. 模块归属

`packages/agent`：

- token 预算和阈值判断；
- 消息安全边界；
- 摘要 prompt/schema；
- 当前模型的压缩调用；
- model context 组装；
- provider-neutral 压缩事件。

`packages/server`：

- `SessionContextCheckpoint` repository；
- checkpoint 版本和并发保护；
- workspace revision/undo 失效；
- persistence barrier 和 run finalizer 适配。

`packages/web`：

- 继续消费 AgentEvent；
- 可忽略压缩生命周期事件；
- 不组装摘要、不选择窗口、不保存 checkpoint。

## 11. 实施阶段与验收

实施顺序：

1. 删除现有按消息数量压缩的占位实现，收紧 runtime contract。
2. 实现纯 token budget、safe boundary 和 sliding-window 模式。
3. 实现当前模型驱动的 compaction engine 和 checkpoint port。
4. 实现 Server session checkpoint repository 和 revision invalidation。
5. 接入模型步骤边界和 AgentEvent。
6. 默认启用 `compaction`，保留 `sliding-window` 配置作为应急开关。

验收必须覆盖：

- 压缩前后历史接口内容完整且不出现摘要助手消息；
- 窗口滑动模式不调用摘要模型；
- 自动压缩失败不会静默切换或伪造成功；
- 工具失败仍能进入后续模型上下文；
- 多步骤工具调用不会出现孤立 tool call；
- 大工具结果受统一预算和分页规则约束；
- checkpoint 重复写入不会倒退 covered sequence；
- undo 或工作簿版本变化后不会使用旧摘要；
- 进程退出发生在摘要生成、checkpoint 保存和下一步模型调用各阶段时都可诊断恢复。
