# P0: 中断或刷新会清空当前轮回复

本文是本问题的唯一实施方案和验收标准。Agent 的通用执行边界、事件协议、持久化确认和取消分类以 [`docs/agent-loop.md`](../../agent-loop.md) 为基础契约。

## 结论

当前问题不是“取消按钮是否调用了 `stop()`”这么简单，而是实时展示和历史加载使用了不同的数据来源：

```text
实时展示: ConversationStore（浏览器内存中的 AgentEvent 投影）
事件持久化: AgentEvent
历史加载: AgentRunCheckpoint.transcript
```

这三者没有统一的投影边界。草稿响应头到达后，前端还会立即把正式 session 激活，导致当前 `ChatPanel` 重建；AI SDK 的内存消息随组件卸载消失，而此时服务端 checkpoint 可能尚未生成，新的历史请求就会返回空消息。

中断的语义必须固定为：

> 停止当前 AgentRun 的模型和工具执行，保留已经通过持久化确认的 text、reasoning 和 tool 事件；绝不删除本轮已经展示或已经落库的内容。

## 术语和边界

### 临时消息不等于前端上下文

旧前端消息状态的“临时”有两个历史职责，必须分开处理：

1. 旧实现把它作为请求上下文发送给服务端。这部分已经被单轮请求协议替代，必须删除。
2. 前端用它承载当前流式 UI。这只是浏览器展示缓存，不能作为持久化权威，但实时渲染仍然需要等价的前端投影状态。

因此不能简单地删除所有前端消息状态。正确做法是删除“前端消息参与 Agent 上下文和恢复决策”的代码，并把实时展示改为消费服务端事件投影。前端不再拼接历史、不再决定模型上下文、不再把 `messages[]` 作为恢复输入。

### Eve 的可借鉴点

Eve 的核心不是“每个 chunk 都由前端请求数据库”，而是：

```text
durable event stream
  -> client reducer
  -> realtime UI

durable event stream
  -> server/session projection
  -> history replay
```

Eve 的 `message.appended`、`reasoning.appended`、`turn.cancelled` 都是同一套有序事件；取消时 reducer 收敛当前未完成 part，不清空已经收到的内容。OpenExcel 应采用同样的事件语义和投影方式，但保留自己的 AgentRun、工具账本和工作簿事务模型。

## 当前根因

### P0-A: 旧草稿切换卸载了流式 UI（已删除）

旧实现中，`useDraftSessionTransition.captureDraftResponse()` 在收到响应头时调用 `beginTransition()`。该双轨已删除：现在第一次发送前显式创建正式 Session，聊天始终请求正式 session endpoint，不再在流中切换 ChatPanel。

因此当前代码不应再通过 draft transition 触发组件卸载；如果仍出现清空，应继续从 ConversationStore 的 session 生命周期或历史加载覆盖路径定位，而不是恢复 draft 兼容逻辑。

### P0-B: 实时流和历史加载不是同一投影

服务端已将 delta 写入 `AgentEvent`，HTTP 返回的 NDJSON stream 也只发送 persistence barrier 确认后的同一事件。历史接口只读取 `AgentRunCheckpoint`，checkpoint 由 finalizer 或 recovery projector 生成。

所以“事件已落库”不代表“历史接口立即可读”。正常终态由 finalizer 投影；浏览器关闭或进程异常后，stale-run worker 会标记 `recovery_required` 并调用 server recovery projector，把已落库事件收敛为 checkpoint。若投影或工具账本检查失败，则保留 `recovery_required`，但不丢弃已落库事件。

### P0-C: 终态投影仍有结构风险

text/reasoning 必须按 `messageId + partId` 聚合，tool 必须按 `toolCallId` 聚合。任何按 assistant 数组下标合并、按全局字符串合并或依赖 `completion.messages` 的实现，都会在多 step、工具调用前后或 reasoning 缺失时串消息或丢消息。

## 目标架构

```text
Agent model/tool loop
  -> ordered AgentEvent emitter
  -> persistence barrier
  -> AgentEvent journal
  -> publish the same confirmed event to the active stream
  -> web ConversationStore reducer

AgentEvent journal
  -> server checkpoint projector
  -> session history projection
  -> GET /messages
```

“同一数据源”指同一套有序 AgentEvent 事实和同一套消息投影语义，不指实时流每个 chunk 都重新读取数据库。事件持久化成功后才能发布给当前订阅者；历史加载读取服务端 checkpoint，必要时由服务端先投影 checkpoint 之后的事件。

### 权威数据

- `AgentEvent`：不可变事实日志，按 `(runId, sequence)` 有序且幂等。
- `AgentRunCheckpoint`：由事件 projector 生成的可恢复读模型，不是另一份独立事实。
- `ConversationStore`：前端当前页面的投影缓存，不是权威数据。
- AI SDK `completion.messages`：本次执行的 transport 结果，不能决定 reasoning、tool state 或历史是否保存。

### 稳定坐标

text、reasoning 和 tool 事件必须携带适用的稳定坐标：

```ts
{
  runId: number,
  turnId: string,
  stepIndex: number,
  messageId?: string,
  partId?: string,
  toolCallId?: string,
  sequence: number,
  delta?: string
}
```

- text/reasoning 按 `messageId + partId` 聚合；
- reasoning 与普通 text 是不同 part，不能压成一个字符串；
- tool call/result 按 `toolCallId` 聚合；
- 同一个 run 内的重复 `(runId, sequence)` 只能应用一次；不同 run 可以重复使用局部 sequence；
- 取消事件只改变生命周期和 part 状态，不删除已有 delta。

### 游标契约

事件 sequence 从 `0` 开始。所有“尚未消费事件”的游标统一使用 `-1`，因此：

```text
待投影事件: sequence > checkpointSequence
首次 checkpoint: checkpointSequence = -1
事件日志尾部: lastEventSequence = 已落库事件的最大 sequence
```

`lastEventSequence` 和 checkpoint 的 `checkpointSequence` 是两个不同边界，不能使用
`0` 表示“尚未开始”，也不能再额外维护一份含义相同但不具备原子更新保证的 transcript 游标。
checkpoint 内容与 `checkpointSequence` 必须在同一个数据库事务中提交。

## 职责划分

### `packages/agent`

- 执行模型/工具循环；
- 生成 provider-neutral AgentEvent；
- 传播 AbortSignal；
- 在 persistence barrier 失败时停止；
- 不依赖 React、HTTP、Fastify 或 Prisma。

### `packages/server`

- 创建 run、保存 user turn、管理 lease 和 cancel intent；
- 持久化 AgentEvent；
- 将已确认事件发布给当前 stream；
- 运行 checkpoint projector 和 recovery；
- 保存 run 终态、工具账本和工作簿事务；
- `/messages` 只返回服务端生成的历史投影。

### `packages/web`

- 发送 `{ requestId, message }` 单轮命令；
- 消费事件流并通过唯一 ConversationStore 渲染；
- 保存当前 runId 并发送显式 cancel；
- 管理折叠、展开、滚动等纯 UI 状态。

前端不得：

- 发送完整 `messages[]` 作为模型上下文；
- 根据本地消息组装下一轮 Agent 输入；
- 读取 AgentEvent 决定终态；
- 在 cancel 或 stream finish 后用旧 `/messages` 覆盖活动 run；
- 因草稿转正式会话而卸载正在输出的 ConversationStore。

## 模块拆分约束

本问题的修复禁止继续向现有大 hook 或 orchestration 文件追加分支。每个模块只能有一个主要变化原因：

```text
packages/agent/runtime/events
  事件协议、sequence、ordered emitter、persistence barrier

packages/agent/runtime/loop
  模型/工具循环、AbortSignal、completion

server/sessions/runs/eventRepository
  AgentEvent 的 Prisma 读写

server/sessions/runs/checkpointProjector
  事件 -> checkpoint 的纯投影和幂等游标

server/sessions/runs/runSettlement
  cancel/completed/failed 的终态协调和 lease fencing

server/sessions/application
  session/chat/cancel 业务用例

server/sessions/chat
  AgentRunner、工具和事件端口的适配

web/chat/conversationStore
  事件 -> UI 消息的唯一前端投影

web/chat/transport
  HTTP/SSE 建连、响应头和订阅关闭

web/session
  session 列表、草稿元数据和会话选择
```

依赖方向必须保持为：

```text
web transport -> web ConversationStore
server route -> application -> runs/chat adapters
server adapters -> agent ports
agent runtime -> abstract ports
runs repositories -> Prisma
```

禁止以下耦合：

- `useChatConversation` 只协调当前会话的 transport、取消和 UI 投影订阅；事件投影集中在 `ConversationStore`；
- `orchestration.ts` 同时负责 Agent loop、checkpoint、终态状态机和 HTTP 响应；
- `runFinalizer.ts` 同时负责事件重建、消息合并、工具账本和 lease 管理；
- repository 感知 React、AI SDK UI message 或 HTTP；
- ConversationStore 直接请求数据库 API、决定 run 终态或执行工具；
- session 切换通过卸载组件来结束 AgentRun。

新增逻辑必须先归属到上述模块之一。若一个文件同时需要修改事件协议、持久化、终态状态和 UI，说明边界错误，应先拆分职责再实现功能。

## 取消和断流协议

### 用户点击中断

```text
web 保存 runId
  -> POST /runs/:runId/cancel
  -> server 持久化 cancelRequestedAt
  -> AbortSignal 传播到模型和工具
  -> ordered emitter flush
  -> 写入唯一 run.cancelled event
  -> projector 收敛 text/reasoning/tool parts
  -> 保存 checkpoint
  -> checkpointSequence 记录最后已投影事件
  -> run.status = cancelled
  -> 释放 lease
```

cancel API 返回成功只表示取消意图已接受，不表示 checkpoint 已完成。前端在等待期间保留当前 ConversationStore，不清空、不重置、不重新加载旧 messages。

### 浏览器关闭或网络断开

浏览器断流不等于用户取消。HTTP 订阅可以消失，但 server-owned run 继续执行；如果进程退出，recovery worker 必须从最后一个持久化边界投影事件，不能只标记状态。

### 草稿转正式会话

服务端可以在响应头返回正式 sessionId，但前端只能更新会话元数据，不能立即替换正在运行的 ConversationStore。正式 session 的激活必须满足以下之一：

- 当前 run 已完成 checkpoint/finalizer 后再切换；或
- ConversationStore 按稳定 runId 保持不变，只更新其 sessionId，不触发组件卸载。

推荐第二种，避免把 UI 生命周期绑定到 session 创建时机。

## 删除和保留清单

### 必须删除

- 前端向 chat endpoint 发送完整 `messages[]` 的逻辑；
- 前端根据 `messages[]` 组装模型上下文的逻辑；
- 前端 run event recovery、前端事件重放和前端 canonical transcript 合并；
- cancel 后清空 ConversationStore 的路径；
- 草稿响应头阶段触发 session 切换并卸载活动流的路径；
- stream 结束后重新请求 `/messages` 并覆盖当前活动投影的路径；
- 以 assistant 数组下标合并 streamed messages 的逻辑。

### 必须保留但改职责

- AI SDK transport：只负责发送单轮请求和接收事件流；
- 前端消息状态：只作为 ConversationStore 的渲染投影；
- `AgentRunCheckpoint`：只作为 AgentEvent 的服务端读模型；
- finalizer：只负责终态协调，不能独自承担 transcript 重建；
- `AgentEvent`：作为实时发布和历史投影的共同事实源。

## 分阶段实施

### Phase 1: 先修复 P0 时序

- 删除 `captureDraftResponse()` 中的立即 `beginTransition()`；
- 草稿创建只记录 `{ sessionId, runId }`，不触发 `ChatPanel` 替换；
- cancel 只发送服务端请求，保留当前投影；
- 增加测试证明草稿响应头到达、cancel 和 stream finish 都不会卸载当前消息状态。

当前状态：已完成。成功草稿响应只记录 session/run 身份；服务端在 AgentEvent stream 关闭前等待 checkpoint/finalizer 完成；cancel 只发送服务端取消意图，前端不调用会丢弃内存消息的停止函数，也不在取消请求发出时切换会话。

### Phase 2: 建立服务端事件读模型

- 统一 AgentEvent payload 坐标和生命周期事件；
- 让 projector 按 sequence、messageId、partId、toolCallId 幂等消费事件；
- checkpoint 至少保存 text parts、reasoning parts、tool state 和最后 sequence；
- finalizer、cancel settlement、stale-run recovery 共用 projector；
- 历史查询只读取 checkpoint；恢复 worker 或 finalizer 负责投影 checkpoint 之后的已落库事件。

当前状态：服务端 projector 已按 `sequence` 幂等消费 text、reasoning 和 tool 事件，稳定保存
`messageId`/`partId`/`toolCallId` 坐标；finalizer 与恢复流程共用同一 projector。历史读取只读
checkpoint；游标初值和 checkpoint 原子提交已落地，P0 的持久化边界已经闭合。

### Phase 3: 统一实时和历史投影（已完成）

- persistence barrier 成功后发布同一个 AgentEvent；
- server stream 传输事件，而不是另行依赖 AI SDK 临时 UI message；
- 前端 ConversationStore 只消费事件并使用与服务端一致的 reducer 规则；
- 历史加载只读取服务端 checkpoint，不再运行前端 recovery 或重新拼接事件。

本阶段不要求前端访问 AgentEvent API。前端只接收当前 run 的确认事件和服务端生成的历史 checkpoint；
Agent loop、工具执行、终态判断和 checkpoint 写入仍由 server/agent 负责。

### Phase 4: 清理过渡代码（已完成）

- 删除前端 transcript/context/recovery 兼容代码；
- 删除 AI SDK UI message transport，统一使用 AgentEvent NDJSON 订阅；
- 删除以 `initialMessages` 覆盖活动 run 的逻辑；
- 删除未被正常历史加载和取消链路使用的浏览器恢复 API；
- 更新架构文档，保证不存在“前端上下文”和“前端权威消息”两套口径。

## 必须测试

- 草稿响应头到达后 text/reasoning 仍持续显示；
- text delta 后点击 cancel，当前页面和刷新后的历史一致；
- reasoning delta 后点击 cancel，reasoning 独立保留；
- cancel 与 completed 并发时只有一个终态；
- cancel 后不会再次发送模型请求或重复执行工具；
- HTTP 断开但未 cancel 时 run 继续并最终可加载；
- 进程退出后 recovery projector 能从 AgentEvent 生成 checkpoint；
- checkpoint 写入失败时 run 不伪装为 cancelled/completed；
- 重复 event/重复 finalizer 不重复拼接 text/reasoning；
- 多 step、工具调用前后多个 assistant message 顺序稳定；
- 同一 `toolCallId` 重放不会重复 workbook/sheet/chart 副作用；
- 正常完成后 reasoning 不因重新加载或状态切换消失；
- 会话切换只加载目标会话，不会请求或覆盖当前活动 run。

## 验收标准

只有同时满足以下条件，P0 才能关闭：

- 点击中断不会清空已经显示的 text、reasoning 或 tool 状态；
- 刷新页面后显示与中断瞬间已持久化的内容一致；
- 实时流和历史加载使用同一 AgentEvent 投影语义；
- 前端不参与 Agent loop、上下文组装、终态决策或权威持久化；
- 草稿转正式会话不会卸载当前流式投影；
- text、reasoning、tool call/result 可以独立回放；
- 持久化失败进入可诊断、可恢复状态；
- 取消、完成、失败不会互相覆盖。
