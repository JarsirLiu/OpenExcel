# P0: 中断对话会清空已生成的回复

本文只定义本问题的专项修复和验收；Agent 事件、completion、终态生产权和持久化边界
以 [`docs/agent-loop.md`](../../agent-loop.md) 为唯一基础契约。

本方案参考 `eve` 的 durable session/run、事件重放、取消后 settle 和服务端权威恢复模型，
但不照搬其“取消时 durable history 只保留已 settle 内容”的取舍。OpenExcel 的要求是：
凡是已经通过 persistence barrier 写入 `AgentEvent` 的 text、reasoning 和 tool 事件，
取消后都必须能从服务端恢复；尚未通过 barrier 的内容不对外承诺。

## 问题

AI 回复或 reasoning 流式生成时点击“中断”，页面闪烁，已经生成的 text 和 reasoning
立即消失；刷新后仍可能只看到中断前的旧 transcript。

中断的语义是停止当前 AgentRun，不是删除对话内容。取消请求被接受不等于取消已经
收敛。只有 server settlement 完成后，前端才以服务端快照替换当前 run 的投影。

## 根因

当前消息状态存在多个互相覆盖的来源：

- AI SDK `useChat.messages` 临时消息；
- server `Session.chatMessages`；
- `AgentEvent` 事件日志；
- `AgentRunCheckpoint`；
- web run recovery projection；
- session/workspace refresh 注入的 `initialMessages`。

`useChat.stop()` 可能清理未完成的 assistant 消息，随后 refresh 或初始化逻辑又用旧
canonical transcript 覆盖当前状态。服务端如果把 abort 当成 `failed`，或者终态写入早于
事件投影，已经落库的 delta 也无法进入最终 transcript。

## 目标架构

```text
AgentEvent 事实日志
    -> AgentRunCheckpoint 可恢复投影
    -> Session.chatMessages canonical transcript
    -> web conversation projection
```

- `AgentEvent` 是不可变事实，按 sequence 回放；
- `AgentRunCheckpoint` 只保存当前 run 的聚合结果；
- `chatMessages` 只保存已经收敛到 session 的 canonical transcript；
- web 内存状态只能展示，不是恢复或持久化权威。

## 职责边界

### Web

只负责发送当前输入、建立/关闭流、发送 cancel、渲染 projection，以及在断流/刷新后
读取 run、checkpoint 和事件。

`useChat.stop()` 只允许停止 HTTP 订阅，不能删除消息、重置 projection 或把旧
`initialMessages` 覆盖到活动 run。Web 不判断 Agent 终态，不拼接 canonical transcript，
不执行工具。

### Agent

只负责模型/工具循环、run-level `AbortSignal`、取消传播、abort error 分类和产生有序
provider-neutral events。Agent 不依赖 HTTP、React、Prisma 或 session 业务代码。

### Server

负责 cancel intent、run lease/fencing、AgentEvent、checkpoint、transcript、tool ledger
和恢复服务。取消收尾由独立的 `settleCancelledRun` 负责，不把取消清理散落在
Agent loop、HTTP orchestration 或通用 transcript 逻辑中。

## 事件协议

事件记录的公共坐标必须保持稳定。`eventId`、`sequence`、`type`、`occurredAt` 属于
事件记录本身；`runId` 属于数据库事件归属；`turnId`、`stepIndex`、`messageId`、
`partId`、`toolCallId` 按事件类型放在 payload 中，不把不适用的字段强行放到每种事件上：

```ts
{
  eventId: string,
  sequence: number,
  type: AgentEventType,
  occurredAt: string,
  payload: {
    runId?: string,
    delta?: string,
    turnId?: string,
    stepIndex?: number,
    messageId?: string,
    partId?: string,
    toolCallId?: string
  }
}
```

`AgentEventType` 使用当前协议名称：`tool.started`、`tool.finished`，不另造
`tool.completed`；工具失败通过 tool ledger 的状态和结果表示，除非协议另行定义独立的
`tool.failed` 事件。

约束：

- `sequence` 在 run 内单调递增，`(runId, sequence)` 唯一；
- 生命周期事件只要求 `runId` 和 `sequence`；step 事件要求 `turnId` 和 `stepIndex`；
  message/reasoning 事件额外要求 `messageId`、`partId`；tool 事件额外要求 `toolCallId`。
  禁止用空字段填充不适用的坐标；
- `turnId` 是一次用户输入，`stepIndex` 是该 turn 内的模型步骤；
- `messageId`、`partId`、`toolCallId` 由 Agent/server 生成，retry/replay 时保持稳定；
- text 按 `messageId + partId` 聚合；reasoning 独立聚合，不能进入普通 assistant text；
- tool 按 `toolCallId` 关联，不能与 text/reasoning 串联；
- 重复事件只能应用一次；事件持久化失败时不得继续模型或工具执行。

取消事件严格按以下顺序产生：

```text
已产生的 delta/tool events
  -> emitter flush
  -> server settlement 写入唯一的 run.cancelled
  -> emitter flush and close
```

Agent 只返回 `completion.status = cancelled`，不自行写入 server durable event；server 的
`settleCancelledRun` 是 `run.cancelled` 这个对外生命周期协议事件的唯一生产者。它类似
Eve 的 `turn.cancelled`，只负责生命周期收敛；part 由 projector 派生为 `cancelled`，不能
把取消伪装成正常 `done`。

## 取消协议

`POST /runs/:runId/cancel` 先用数据库条件更新写入取消意图：

```text
running + cancelRequestedAt IS NULL
  -> running + cancelRequestedAt
```

只有首次成功写入的请求通知当前进程；重复请求幂等，终态 run 不得被改写。

请求必须绑定调用方观察到的 run。当前以 `runId` 作为身份；如果同一 session 允许快速
切换或并发 run，则同时校验 `turnId` 和 run version，防止旧页面取消新 run。

取消接口返回：

```ts
{
  runId: string,
  status: "cancel_requested" | "cancelled" | "completed" | "failed" |
    "recovery_required",
  terminal: boolean,
  recoverable: boolean,
  lastEventSequence: number,
  checkpointSequence: number,
  transcriptSequence: number
}
```

`cancel_requested` 仅表示取消意图已落库。前端必须继续查询或订阅，直到收到 terminal
snapshot；不能把 cancel API 返回成功当作取消 settlement 完成。

cancel、completed、failed 只能有一个终态获胜。必须使用数据库条件更新、版本号或 lease
fencing，不能只依赖进程内 AbortController。HTTP 断开不等于用户取消，断流时 AgentRun
继续执行。

## `settleCancelledRun` 和 Finalizer

取消 settlement 固定为：

```text
1. 获取 run lease / fencing token
2. 传播 AbortSignal，停止模型和工具
3. flush 已进入 emitter 的 AgentEvent
4. 在有限的工具取消超时内等待安全边界退出
5. 超时或存在未知副作用时进入 `recovery_required`，不得无限等待
6. 写入唯一的 `run.cancelled` event，并再次 flush/close emitter
7. 按 sequence 投影 text/reasoning/tool parts
8. 幂等保存 AgentRunCheckpoint
9. 在 session lease 下写入 Session.chatMessages
10. 条件推进 transcriptSequence
11. 清理 pending tool/input，释放 session active run
12. 写入 run = cancelled
13. 释放 run lease
```

正常完成、失败、取消和恢复都使用同一套幂等投影规则，不能让正常完成依赖
`completion.messages` 来决定是否保存 reasoning。所有终态都必须以已持久化事件为事实来源；
取消的生命周期收尾由 `settleCancelledRun` 单独拥有。

游标含义固定为：

```text
lastEventSequence  = 已落库的最新事件
checkpointSequence = 已合并进 AgentRunCheckpoint 的最新事件
transcriptSequence = 已合并进 Session.chatMessages 的最新事件
```

所有游标只能向前推进。重复 finalizer、多实例恢复或旧 lease owner 都不能重复追加
delta，也不能用旧 checkpoint 覆盖新 checkpoint。

取消收敛后 session 必须回到无 active run 的 idle 状态，才能接受下一轮输入，等价于
Eve 的 `turn.cancelled -> session.waiting`。

## 持久化失败

checkpoint 或 transcript 任一步失败时：

- 不得写入 `completed` 或 `cancelled`；
- 保留已经落库的 AgentEvent；
- run 进入 `recovery_required` 或 `persistence_failed`；
- 后续从最后成功游标继续投影；
- checkpoint 已成功但 transcript 失败时，checkpoint 仍是恢复输入，不能被旧 transcript
  覆盖；
- 未确认的工具副作用不得自动重放。

Checkpoint 中的流式 part 必须保留结构，不能把 reasoning 压缩成单个字符串：

```ts
reasoningParts: Array<{
  messageId: string;
  partId: string;
  stepIndex: number;
  sequence: number;
  text: string;
  status: "streaming" | "cancelled" | "done";
}>
```

text parts 使用同样的坐标和状态模型；tool state 至少保留 `toolCallId`、`stepIndex`、
状态、输入、结果或未知副作用标记。这样多个 step 的 text、reasoning 和 tool 才能独立
回放。

取消 settlement 必须有有限的工具等待时间。超时后保留事件和工具账本，标记
`recovery_required`，由恢复流程处理，不能继续假设本次取消已经收敛。

## 工具取消

工具账本区分：

```text
requested | running | committed | failed | cancelled | unknown
```

- `committed` 的 workbook/sheet/chart 副作用不能因取消回滚；
- `cancelled` 表示确认未执行；
- `running`/`unknown` 进入 `recovery_required`；
- 只有 ledger/receipt 证明未执行时才允许重试；
- 同一 `(runId, toolCallId)` 重放只能返回原结果，不能重复修改 workbook。

## Web 状态收敛

前端拆成三个职责：

```text
useChatTransport
  发送请求、建立流、停止 HTTP 订阅

conversationProjection
  canonical messages + 活动 run events + sequence 去重

runRecovery
  查询 run 游标、读取 checkpoint、回放后续 events、读取最终 transcript
```

取消流程：

```text
保存 runId
  -> POST cancel(runId[, turnId/version])
  -> 停止 HTTP 订阅
  -> 保持当前 projection 不变
  -> 查询/订阅 terminal snapshot
  -> 只替换该 run 的 projection
```

停止 HTTP 订阅不代表服务端取消成功；`run.cancelled` 只表示取消事实已记录，确认必须来自
最终 run 查询中的 `status = cancelled` 及已收敛的 checkpoint/transcript 游标。

页面刷新流程：

```text
读取 Session.chatMessages
  -> 查询 recoverable run
  -> 读取 AgentRunCheckpoint
  -> 回放 checkpointSequence 之后的 AgentEvent
  -> terminal 后重新读取 Session.chatMessages
```

Checkpoint 是 run 级增量投影，canonical transcript 是 session 级最终对话记录。前端
在任一时刻只能以 canonical transcript 或 checkpoint 为基准，再应用更高 sequence 的
事件，禁止把二者完整拼接后重复显示同一段内容。

服务端 `/messages` 的读取优先级必须明确：

```text
已收敛的 Session.chatMessages
  + transcriptSequence 之后仍存在的 recoverable run checkpoint/events
  -> 一个去重后的服务端 transcript
```

不能因为 `Session.chatMessages` 非空就直接返回并忽略 recoverable run；也不能把
`run.outputText` 作为流式 text/reasoning 的恢复来源。历史接口必须使用
`messageId + partId + sequence` 投影 text/reasoning，并使用 `toolCallId` 恢复工具状态。

## 实施顺序

0. 先建立可观测性：为每次取消记录 `runId`、取消时间、最后落库 sequence、checkpoint
   sequence、transcript sequence 和最终状态，先证明实际失败点。
1. 确认当前 `runId/turnId/stepIndex/messageId/partId/toolCallId` 在 AgentEvent、checkpoint、
   tool ledger 和恢复接口中稳定传递；禁止仅依赖 AI SDK `completion.messages`。
2. 完成 run 终态、lease/fencing、游标和 checkpoint 的数据库条件更新与幂等约束。
3. 抽出 `settleCancelledRun`，统一取消事件、partial part 收敛、session idle 和 run 终态；
   cancel API 明确返回 `accepted`/`settled`，不能假装已完成。
4. 统一 finalizer 的事件投影和持久化顺序，覆盖 completed/cancelled/failed/recovery，
   并保证 cancel settlement 完成后 HTTP 查询可立即读到结果。
5. 确认 Agent abort 能停止模型和工具，且不会产生普通 failed；HTTP 断开仍与用户取消分离。
6. 让 `/messages` 服务端读取 canonical transcript 与 recoverable checkpoint/events 的合并结果，
   前端只消费该权威快照和事件游标。
7. 抽出唯一 web conversation projection owner，禁止 refresh/initialMessages 覆盖活动 run。
8. 删除前端 snapshot/setMessages 等取消补丁，改为消费 terminal snapshot；最后再清理兼容性代码。

## 必须通过的测试

- text delta 后取消，查询/刷新仍保留 text；
- reasoning delta 后取消，reasoning 独立保留且不混入 text；
- text、reasoning、tool 在多个 step 中分别回放且顺序稳定；
- 取消期间不启动新的模型/tool step；
- 已提交工具副作用不回滚，未确认工具不自动重放；
- abort rejection 被识别为 cancelled，不产生普通 failed；
- cancel 与 completed 并发时只产生一个终态；
- 旧 run 的 cancel 请求不会影响新 run；
- cancelled settlement 后 session 回到 idle；
- finalizer 重复执行不会重复拼接 delta；
- checkpoint 成功但 transcript 失败后可从游标继续恢复；
- terminal event 与最后一个 delta 的顺序稳定；
- cancel 后立即刷新可恢复内容；
- 正常完成后 reasoning 仍存在，且与 assistant text、tool state 分离；
- `/messages` 在 canonical transcript 落后时仍能从 checkpoint/events 返回完整恢复结果；
- HTTP 断开但未 cancel 时 AgentRun 继续执行；
- 多实例/旧 lease owner 不能覆盖新 checkpoint；
- 同一 `(runId, toolCallId)` 重放不会重复执行工具。

## 验收标准

只有同时满足以下条件才算修复完成：

- 点击中断不会删除已经显示的 text 或 reasoning；
- `cancel_requested` 与最终 `cancelled` 语义明确；
- 中断 settlement 后查询和刷新结果一致；
- text、reasoning、tool call/result 可以独立回放；
- cancel、completed、failed 不会互相覆盖；
- 事件、checkpoint、transcript 游标单调且幂等；
- 持久化失败进入可诊断、可恢复状态；
- session 在取消后回到 idle；
- 前端不参与 Agent loop、终态决策或权威 transcript 持久化。
