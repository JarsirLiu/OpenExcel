# Agent Loop：可靠执行架构与迁移方案

本文档是 OpenExcel Agent 系统的职责边界、消息协议和改造基线。它覆盖
`packages/web`、`packages/server`、`packages/agent` 之间的协作方式。

本文档是所有 Agent 相关重构的唯一详细依据。`docs/architecture.md` 只
定义稳定的包边界、依赖方向和顶层数据流；如果 Agent 的上下文、工具循环、
事件、重试、恢复、幂等、持久化或迁移策略发生变化，应先修改本文档，再在
总架构文档中仅同步必要的边界变化。

本文档中的“当前基线”描述已经存在的能力；“目标协议”和“迁移阶段”描述
尚未完全落地的目标。实现时必须明确标记代码对应的是哪一层，不能把规划
字段或接口误认为已经存在。

本文档的最高优先级原则是：

> 前端不参与 Agent loop，不组装模型上下文，不执行工具，也不保存权威 transcript。
> 服务端从持久化会话恢复上下文，调用 `packages/agent` 的 AgentRunner 执行完整 Agent loop，
> 保存运行结果，再通过流式事件通知前端。

本文档替代旧的“前端提交完整 AI SDK messages，由服务端直接转发给 Agent”的规划。旧协议不再接受，
必须在 HTTP 边界直接返回 400。

## 1. 当前基线

当前项目已经具备后端执行工具和运行记录的基础能力：

- `AgentRun` 记录一次 Agent 执行的状态、模型、输入、输出和错误。
- `AgentStep` 记录模型步骤、工具名、输入、输出和顺序。
- workbook、sheet、chart 工具都由 `packages/server` 注册和执行。
- 工具产生的工作簿修改和撤销快照由服务端持久化。
- `Session.chatMessages` 保存 AI SDK UI message transcript。
- `packages/agent` 负责模型调用、工具循环、上下文预算和 UI stream 转换。
- `packages/web` 使用 AI SDK React hooks 消费流并渲染消息、工具状态和工作簿刷新。

当前实现中的旧状态名（例如 `error`、`aborted`）与目标协议中的
`failed`、`cancelled` 不是可以混用的同义词。迁移时必须在服务端状态边界
显式映射并补齐诊断字段；新代码不得通过字符串比较偷偷引入第三套状态。

当前仍存在一个必须修正的边界问题：

- 前端 `useChat` 持有的 `messages[]` 被作为聊天请求体发送到服务端。
- 服务端目前直接使用这批前端消息构造模型输入。
- 前端只加载最近一页消息时，这批消息可能不完整。
- 流结束时如果用这批消息覆盖 `Session.chatMessages`，旧历史会丢失。

因此当前实现是过渡状态，不能把“前端提交 transcript”视为目标架构。

### 1.1 第一阶段已落地

当前代码已经完成单轮请求边界的硬切换：

- chat 接口只接受 `{ requestId, message }`，旧的 `{ messages: [] }` 请求直接返回 400，不提供兼容分支。
- 服务端从 `Session.chatMessages` 读取 canonical transcript，在创建 `AgentRun` 前追加并保存本轮 user message。
- `packages/agent` 提供 `AgentRunner` 入口，在包内组装 workspace context、system prompt 和模型上下文。
- 服务端 chat adapter 只负责资源加载、工具注入、运行记录和流适配；不再向 AgentRunner 传入浏览器历史。
- 前端仍可用本地 `messages` 做展示和流式状态，但 transport 只发送当前 user turn；`onRunSettled` 不再接收消息数组。

本阶段已经补齐 AgentEvent 和 AgentToolExecution 的基础服务端持久化。事件持久化适配器会在同一事务中写入
AgentEvent 和对应 AgentStep；工具账本会对 `(runId, toolCallId)` 做参数校验、完成结果回放和 stale running 回收。
本阶段已补齐断流后的 Agent completion 解耦、持久化失败诊断、事件回放去重和基础恢复入口；跨进程取消仍通过数据库标记与轮询协作。

### 1.2 本轮已落地：运行生命周期与取消边界

- `AgentRun` 使用受限状态转换：`running` 只能进入 `completed`、`cancelled`、`failed`、
  `persistence_failed` 或 `recovery_required`；撤销只允许把已结束运行标记为 `reverted`。
- `cancelRequestedAt` 是服务端取消意图的持久化标记。取消接口重复调用不会重复执行取消动作，终态运行也不会被改写。
- `POST .../runs/:runId/cancel` 是唯一的显式取消入口。它先更新数据库，再通知当前进程中的 Agent；Agent 在模型调用和工具执行边界收到 `AbortSignal` 后结束为 `cancelled`。
- SSE/HTTP 响应断开不再调用 Agent 的 `AbortController`。AI SDK 的独立消费支路继续驱动服务端运行，连接断开只影响订阅者。
- 当前取消信号在本进程通过注册表即时唤醒，并周期性读取数据库标记；跨进程运行租约、进程退出恢复和事件回放仍未完成。

## 2. 不可违反的职责边界

### 2.1 Web 前端负责什么

前端负责：

- 收集用户本轮输入。
- 收集用户明确选择的 workbook、sheet 引用 ID。
- 生成本次请求的 `requestId` 或幂等键。
- 展示用户消息、assistant 文本、reasoning、tool call 和 tool result。
- 消费后端的 UI message stream 或 Agent event stream。
- 在后端工具事件确认后刷新工作簿。
- 连接断开后重新读取服务端 transcript、run 和工作簿状态。
- 管理输入框、滚动、展开状态和其他纯 UI 状态。

前端不得负责：

- 提交完整历史作为模型上下文。
- 决定 system prompt、工具列表或 workspace context。
- 执行工具或伪造 tool result。
- 决定上下文窗口、token 裁剪和工具结果预算。
- 将本地 `messages[]` 作为服务端 transcript 的权威副本。
- 根据本地消息决定 Agent 是否继续下一步。

`useChat` 可以继续保留，但它在前端只能作为流式 UI 状态容器和渲染适配器，不能成为 Agent
状态机或会话数据库。

### 2.2 Server 负责什么

服务端负责：

- 会话和 workspace 资源授权。
- 从数据库读取完整 canonical transcript。
- 校验、去重并追加本次用户消息。
- 创建和收尾 `AgentRun`。
- 读取并授权 workspace context，解析引用，并把已授权的结构化上下文传给 Agent 引擎。
- 根据用户、workspace、资源范围和审批策略计算本轮可见工具集合。
- 解析 workbook/sheet 引用并使用服务端权威名称和 ID。
- 创建 `AgentExecution` 所需的服务端适配器和持久化端口。
- 执行 Agent 请求的具体 workbook/sheet/chart 工具，保存工具步骤和工作簿修改。
- 在每次工具调用执行前再次校验能力、资源范围和审批状态；工具可见性不是授权边界。
- 保存完整 transcript，不能被前端分页结果覆盖。
- 在失败、取消、断流和重试时保持数据一致性。
- 通过流式协议向前端发送可展示事件。

### 2.3 Agent 包负责什么

`packages/agent` 属于后端运行时的一部分，负责：

- 模型适配和调用。
- 完整 Agent loop 和运行时状态机。
- system prompt 模板和 model-facing context 组装；服务端只提供已授权的上下文数据。
- ModelMessage/UIMessage 转换。
- 模型上下文窗口裁剪。
- 用户输入和工具结果的 token 预算。
- 通用工具调用协议、工具循环和停止条件；不拥有 Excel 工具目录或业务权限。
- 模型限流错误分类、指数退避和单次运行的重试预算。
- 把工具请求交给注入的 `ToolExecutor`，接收结果后继续循环。
- 产出与传输无关的 Agent 事件，以及可选的 AI SDK UI stream 适配。

Agent 包使用 Vercel AI SDK 作为内部模型执行引擎。当前实现使用
`streamText`、`stopWhen` 和 AI SDK 的多步工具执行能力；后续可以在不改变
OpenExcel Agent contract 的前提下切换到 AI SDK 的 `ToolLoopAgent`。这两个
API 都只能出现在 `packages/agent` 内部，不能成为 server 的业务接口。

Vercel AI SDK 是执行引擎，不是 OpenExcel 的业务边界。OpenExcel 自己的
`AgentRunner`、`ToolExecutor`、`AgentEvent` 和持久化确认协议位于 AI SDK 之上，
用于隔离模型供应商、工具执行、数据库持久化和 HTTP 传输。

`packages/agent` 不负责：

- Prisma 查询。
- workspace/session 授权。
- HTTP 路由。
- React 状态。
- 直接决定某个用户是否有权读取 workbook 或 sheet。
- 具体 workbook/sheet/chart 数据库工具实现。
- AgentRun、AgentStep 或 transcript 的数据库持久化。

Excel 工具的 provider-neutral capability contract（名称、描述、输入 schema、所需能力和
资源范围）属于 `packages/core`，不属于 Agent runtime。Agent 只接收 server 根据当前用户和
workspace 策略过滤后的工具定义；server 必须在执行时重新授权，不能信任模型是否看到了某个工具。

服务端可以把完整的 canonical transcript 和已授权的运行上下文传给 agent，但 agent 不应从浏览器接收或信任一份完整历史。
Agent 引擎只依赖显式输入和端口，不依赖 `packages/server`；服务端不得在 `sessions/chat` 中重新实现
模型循环、上下文裁剪、重试或停止条件。

### 2.4 Agent 内核模块职责

Agent 内核采用一个 facade 加多个单一职责模块的结构。`AgentRunner` 是对外入口，
但不是所有实现的容器；除非一个模块保持单一且内聚的职责，否则不得继续向
`agentRunner.ts` 添加逻辑。

```text
packages/agent/src/
├─ runtime/
│  ├─ loop/                # 一次运行的 facade 和模型/工具 loop
│  ├─ tools/               # 通用 tool contract -> AI SDK ToolSet
│  ├─ events/              # provider-neutral AgentEvent 和序列
│  ├─ stream/              # Agent 输出 -> AI SDK UI message stream
│  ├─ contracts.ts         # Agent 输入、端口和运行结果协议
│  └─ model/               # provider/model resolver
├─ prompt/
│  └─ systemPrompt.ts      # system prompt 纯函数
├─ session/
│  ├─ context.ts            # workspace model-facing context
│  ├─ contextWindow.ts      # token 预算和上下文裁剪
│  └─ transcript.ts         # canonical transcript -> model messages
```

各模块的硬边界如下：

- `agentRunner.ts` 负责读取输入、调用 context/prompt builder、创建 loop、汇总运行终态；
  不直接调用 Prisma、HTTP 或具体 workbook 工具。
- `agentLoop.ts` 负责调用 Vercel AI SDK、执行多步模型/工具循环、应用停止条件和
  运行时预算；不负责 server 持久化和 HTTP response。
- `contracts.ts` 只定义 `ToolExecutor`、`AgentEventSink`、持久化确认、取消和恢复输入；
  不依赖 AI SDK 的 server 类型。
- `toolAdapter.ts` 是唯一允许把 OpenExcel tool contract 转换成 AI SDK `ToolSet` 的位置。
  server 不直接把 AI SDK `ToolSet` 传入 AgentRunner。
- `events.ts` 只定义事件结构和事件序列，不落数据库，也不发送 HTTP。
- `retryPolicy.ts` 只决定 provider/Agent 调用是否可重试，不执行工具、不修改 run 状态。
- `uiStreamAdapter.ts` 只负责传输格式转换；UI stream 不是 canonical transcript，也不是
  Agent 状态机。
- `session/` 和 `prompt/` 中的 context/prompt 构造必须保持纯函数，不读取数据库或浏览器状态。
- Excel capability contract、工具名称、输入 schema、所需能力和资源范围属于
  `packages/core`；Agent runtime 不拥有 Excel 工具目录，也不导入 `packages/core` 的业务模块。

Agent 内核的依赖方向必须保持为：

```text
AgentRunner
  -> AgentLoop
  -> Vercel AI SDK
  -> injected ToolExecutor / EventSink / PersistenceBarrier
```

`AgentRunner` 可以依赖 `agentLoop`，但 `agentLoop` 不能反向依赖 server；
`uiStreamAdapter` 只能被需要 UI stream 的 server transport 使用，Agent 核心不能依赖 React。

## 3. 目标数据流

### 3.1 单轮聊天

```text
Browser
  └─ { message, requestId }
       ↓
Server route
  └─ 资源授权和请求校验
       ↓
Session application service
  ├─ 读取完整 Session.chatMessages
  ├─ 去重 requestId/messageId
  ├─ 追加本轮 user message
  ├─ 创建 AgentRun
  └─ 保存完整 canonical transcript
       ↓
Server chat adapter
  ├─ 解析引用并完成资源授权
  ├─ 加载已授权 workspace context
  ├─ 创建 ToolExecutor 和运行控制输入
  └─ 调用 packages/agent 的 AgentRunner
       ↓
packages/agent AgentRunner
  ├─ 生成 model-facing messages
  ├─ 裁剪模型上下文
  ├─ 执行模型和工具循环
  ├─ 执行限流分类、指数退避和停止条件
  └─ 产出 Agent 事件并调用注入的 ToolExecutor
       ↓
Server persistence adapter
  ├─ 先持久化权威事件、步骤和 transcript 变化
  ├─ 提交工具副作用和结果事务
  ├─ 完成 AgentRun
  └─ 将已持久化事件实时转发给订阅者
       ↓
Browser
  └─ 渲染事件，必要时重新读取服务端状态
```

事件不是等 Agent 全部结束后才一次性生成。AgentRunner 产生事件后，
服务端持久化适配器必须先完成对应的 durability barrier，再把事件发送给
当前订阅者；订阅者断开只影响发送，不影响已经取得租约的 AgentRun。

### 3.2 模型上下文的三份数据

服务端必须区分以下三份数据，不得混用：

1. **Canonical transcript**
   - 服务端持久化的完整会话。
   - 由用户消息和服务端产生的 assistant/tool 消息组成。
   - 是恢复会话和重新运行的唯一权威来源。

2. **Resolved transcript**
   - 服务端基于 canonical transcript 解析 workbook/sheet 引用后的副本。
   - 引用失效时必须明确标记 unavailable，不能猜测其他资源。
   - 只用于服务端后续的模型准备和事件生成。

3. **Model context**
   - 在 resolved transcript 的基础上加入 system prompt，并执行上下文预算裁剪。
   - 只作为本次模型请求的输入。
   - 裁剪不得反向修改 canonical transcript。

前端不得参与这三份数据之间的转换。

每次模型调用前，服务端已经保存本轮用户消息；每次下一轮模型调用前，
上一轮的 assistant tool-call、服务端 tool result 和必要的运行事件都必须
进入可恢复的持久化边界。模型上下文可以是裁剪后的副本，但不能绕过这条
顺序直接依赖浏览器内存中的流式消息。

上下文裁剪必须保持消息结构合法：assistant 的 tool-call 与对应的 tool
result 不能被拆开，不能只保留工具结果，也不能把裁剪结果写回
`Session.chatMessages`。无法在预算内保留完整的一轮时，应删除完整的一轮
或使用明确标记的服务端摘要；不能随机删除二维表格中的值或静默拼接半条消息。

## 4. HTTP 请求和流协议

### 4.1 聊天请求

目标请求体是单轮命令，而不是 transcript：

```ts
type ChatTurnRequest = {
  requestId: string;
  message: UserTurnInput;
};

type UserTurnInput = {
  messageId: string;
  role: "user";
  parts: Array<
    | { type: "text"; text: string }
    | { type: "data-chat-reference"; workbookId?: string; sheetId?: string }
  >;
};
```

这是一个独立的请求 DTO，不直接复用 AI SDK `UIMessage`。服务端必须使用运行时 schema 校验：

- `requestId`、`messageId` 非空且长度受限；`requestId` 在同一 workspace/session 内唯一。
- `role` 必须是 `user`；parts 只允许文本和受限的引用 part。
- 引用只能携带稳定的 workbook/sheet 公共 ID，不接受名称、TipTap 节点、模型消息或客户端权限字段。
- 服务端拒绝 assistant、system、tool-call、tool-result、reasoning 等客户端伪造 part。
- 相同 `requestId` 重试时必须校验请求体哈希；相同 ID 配不同内容返回冲突，不能覆盖原请求。

服务端负责生成 canonical message 的时间、来源和运行关联字段。前端的 `messageId` 只用于本轮去重，
不能成为权限、工具结果或历史内容的权威来源。

草稿会话和已存在会话可以继续使用现有两个 HTTP 路径，但必须采用相同的单轮请求契约：

```http
POST /api/workspaces/:workspacePublicId/sessions/draft/chat
POST /api/workspaces/:workspacePublicId/sessions/:sessionPublicId/chat
```

`Idempotency-Key` 或请求体中的 `requestId` 必须覆盖草稿和已存在会话，而不是只覆盖草稿创建。

### 4.2 流式响应

第一阶段可以继续使用 AI SDK UI message stream。其含义必须明确：

- stream 是服务端 Agent 执行结果的传输协议。
- 前端只消费和渲染 stream。
- `originalMessages` 等 AI SDK 参数不能成为前端历史覆盖数据库的理由。
- 服务端断流时，客户端必须通过查询接口恢复状态，而不是把本地消息重新提交为权威 transcript。

目标实现必须在现有 session/run 资源边界下提供 Agent event stream。Agent 内部事件不携带
Prisma 或 HTTP 字段；server 持久化适配器负责补充 run 身份、序号和传输元数据：

```ts
type AgentEvent =
  | { type: "run.started"; payload: { droppedMessages: number; droppedTurns: number } }
  | { type: "step.started"; payload: { stepNumber: number } }
  | { type: "tool.started"; payload: { toolName: string; toolCallId: string; input: unknown } }
  | { type: "tool.finished"; payload: { toolName: string; toolCallId: string; input: unknown; output?: unknown; error?: unknown } }
  | { type: "step.finished"; payload: StepPayload }
  | { type: "run.completed"; payload: { error?: undefined; isAborted: false; messageCount: number } }
  | { type: "run.failed"; payload: { error: AgentError; isAborted: false; messageCount: number } }
  | { type: "run.cancelled"; payload: { error?: undefined; isAborted: true; messageCount: number } };

type StepPayload = {
  stepType: "text" | "tool-call" | "tool-result";
  finishReason: "stop" | "tool-calls" | "error";
  text?: string;
  toolCalls?: Array<{ toolName: string; toolCallId: string }>;
  toolResults?: Array<{ isError: boolean }>;
};

type AgentError = {
  code: string;
  message: string;
  retryable: boolean;
  providerRequestId?: string;
};

type PersistedAgentEvent = {
  runId: number;
  eventId: string;
  sequence: number;
  occurredAt: string;
  event: AgentEvent;
};
```

**事件payload详解**：

1. **run.started**: Agent开始执行时触发，记录上下文裁剪丢弃的消息数和轮次数
   - `droppedMessages`: 因token预算裁剪丢弃的消息数
   - `droppedTurns`: 因token预算裁剪丢弃的完整轮次数

2. **tool.started**: 工具开始执行时触发，用于持久化工具调用意图
   - `toolName`: 工具名称
   - `toolCallId`: 工具调用唯一ID（用于幂等）
   - `input`: 工具输入参数

3. **tool.finished**: 工具执行完成时触发，用于持久化工具结果
   - `toolName`: 工具名称
   - `toolCallId`: 工具调用唯一ID
   - `input`: 工具输入参数
   - `output?`: 成功时的工具输出（与error互斥）
   - `error?`: 失败时的错误信息（与output互斥）

4. **step.started**: 模型步骤开始前触发，只携带步骤序号，不携带 provider request、workspace 数据或完整消息
   - `stepNumber`: 当前模型步骤序号

5. **step.finished**: 模型步骤完成时触发，用于持久化AgentStep
   - server持久化适配器从此事件提取`stepType`、`status`、`content`、`toolName`、`input`、`output`等字段
   - `stepType`: 步骤类型（text/tool-call/tool-result）
   - `finishReason`: 结束原因（stop/tool-calls/error）
   - `text?`: 模型生成的文本内容
   - `toolCalls?`: 工具调用列表
   - `toolResults?`: 工具结果列表

6. **run.completed**: Agent正常完成时触发
   - `error`: 必须为undefined或不存在
   - `isAborted`: 必须为false
   - `messageCount`: 最终消息数量

7. **run.failed**: Agent执行失败时触发
   - `error`: 错误详情（格式化后的AgentError）
   - `isAborted`: 必须为false
   - `messageCount`: 失败前的消息数量

8. **run.cancelled**: Agent被显式取消时触发
   - `error`: 可选的取消原因
   - `isAborted`: 必须为true
   - `messageCount`: 取消时的消息数量

**事件顺序和持久化约束**：

- 所有事件必须通过`PersistenceBarrier.persist()`确认后才能通过`AgentEventSink.publish()`广播；持久化适配器可以拒绝事件，但不向 Agent 暴露数据库对象
- 持久化失败时，Agent必须立即停止执行，不允许仅记录日志后继续
- `sequence`在一个run内单调递增，客户端回放时按sequence去重
- `tool.finished`事件的output/error字段互斥，不能同时存在
- `step.started`和`step.finished`只保留回放所需的规范化字段，不写入完整 provider request/response

每个事件通过统一信封传输，并在服务端持久化后才允许进入可恢复流：

```ts
type AgentEventSink = {
  publish(event: AgentEvent): Promise<void>;
};

type PersistenceBarrier = {
  persist(event: AgentEvent): Promise<void>;
};
```

`sequence` 在一个 run 内单调递增，`eventId` 全局唯一。客户端按 `sequence` 去重，不按到达次数追加
消息。事件必须包含足够的工具输入、工具结果或错误信息，使服务端可以重建运行状态；敏感数据按日志策略
脱敏，不能为了回放把未授权 workbook 数据直接暴露给浏览器。

事件流是展示和恢复协议，不是把 Agent loop 下放到浏览器。流接口必须支持：

- `GET .../runs/:runId/events?after=<sequence>` 增量回放。
- 客户端通过 `after` 或 `Last-Event-ID` 重连，不重新提交用户消息。
- 运行结束后返回终态 run、完整 canonical transcript 和受影响 workbook/sheet 的版本摘要。
- 事件缺失、游标非法或 run 已被清理时，返回明确的 resync 响应，客户端重新读取 messages、run 和 workbook。

第一阶段即使继续使用 AI SDK UI message stream，也必须由服务端维护上述 run 状态和恢复接口；UI stream
只是传输适配，不是唯一的恢复来源。

### 4.3 运行控制接口

运行控制必须有独立的资源接口，不能复用 HTTP 连接生命周期：

```http
POST /api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs/:runId/cancel
GET  /api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs/:runId
GET  /api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs/:runId/events?after=<sequence>
```

- cancel 接口只接受显式用户取消命令，必须鉴权、幂等，并返回当前 run 状态。
- run 查询返回状态、错误分类、最后事件序号、受影响资源版本和是否需要恢复。
- events 接口必须鉴权并按 workspace/session/run 校验归属；浏览器只能读取经过授权的事件投影。
- web 的中断按钮必须使用响应头保存的 session/run ID 调用 cancel 接口，再停止本地流；组件卸载和普通断流仍不能调用 cancel。
- 连接断开不调用 cancel 接口；重连使用 run 查询和事件游标恢复 UI。

## 5. Agent 执行生命周期

一次用户请求必须遵循以下顺序：

1. 路由完成 workspace/session 授权和请求校验。
2. 服务端取得 session 运行租约，再读取完整 transcript。
3. 服务端检查 requestId/messageId，已处理的请求直接返回已有运行结果或冲突信息。
4. 服务端在同一事务中追加本轮用户消息、创建 `AgentRun(status = running)` 和初始运行事件。
5. 服务端提交事务后，解析引用、完成资源授权，并创建 AgentRunner 所需的上下文和端口。
6. `packages/agent` 根据服务端提供的完整 transcript 和已授权上下文生成 model context。
7. `packages/agent` 执行模型循环；产生工具请求时调用服务端注入的 `ToolExecutor`。
8. 服务端为每个工具调用使用 `(runId, toolCallId)` 幂等记录，在事务中完成授权、工作簿修改、撤销快照和工具执行记录。
9. AgentRunner 接收已确认的工具结果并决定继续、重试或结束；服务端在每个下一步之前持久化对应的 assistant/tool transcript、事件和步骤。
10. 服务端完成 transcript 收尾和终态事件持久化后，再将 run 置为 terminal 状态；不能先标记完成再补写历史。
11. 服务端将已持久化的事件实时转换为 stream 返回前端；发送失败只触发后续回放，不删除已持久化状态。

第 7 至第 10 步由 `packages/agent` 的引擎和服务端注入的工具适配器共同完成，但循环控制权只属于
AgentRunner。浏览器不能因为没有收到某个事件就重新执行工具或重新组装下一轮消息。

## 6. 工具调用边界

工具调用的唯一执行方是服务端。一次有副作用的工具调用必须遵循以下顺序：

```text
AgentRunner emits tool request
    ↓
server ToolExecutor validates input, capability, resource scope, and approval
    ↓
server reserves (runId, toolCallId) and persists tool.started
    ↓
server transaction commits workbook change, undo snapshot, tool result, and tool.completed
    ↓
server returns structured ToolExecutionResult
    ↓
AgentRunner continues or stops the loop
    ↓
server sends already-persisted event to browser
    ↓
browser renders and refreshes affected UI
```

工具可见性和工具授权必须分开：Agent 只接收可见工具集合，但模型仍可能伪造调用，旧 run
或重试请求也可能绕过可见性过滤。因此 server 的 ToolExecutor 必须在副作用事务前重新执行
授权。高风险工具可以返回 `approval_required`，由 server 持久化审批请求、操作范围和参数
哈希；用户批准后使用一次性、带过期时间的 approval token 恢复执行。

前端的 `useSheetPatchSync` 或工作簿刷新逻辑只能做显示同步，不能作为工具执行成功的判断依据。
数据库提交和 `AgentStep` 才是事实来源。

工具 capability contract 继续放在 `packages/core`，具体执行适配器继续放在对应 server 领域：

- `packages/server/src/modules/sheets/tools/`
- `packages/server/src/modules/workbooks/tools/`
- `packages/server/src/modules/charts/tools/`

Agent 不依赖 `packages/core` 的具体业务模块。server 作为 composition root，将 core capability
contract、当前用户可见性、资源范围和 server-owned executor 映射为 Agent 的通用工具输入。

不应把工具执行移动到 `packages/web`，也不应让前端回传 tool result 作为模型上下文。

### 6.1 AgentRunner contract

`AgentRunner` 是 Agent 运行 facade 和生命周期协调器；实际的 Vercel AI SDK loop
由同包的 `agentLoop.ts` 执行。二者共同拥有 Agent loop，server 不能复制其中任何一部分。

`AgentRunner` 必须通过显式输入和端口工作，至少接收：

- 已授权的 model-facing context 输入，而不是浏览器消息数组；
- 稳定的模型和工具配置；
- 服务端注入的 `ToolExecutor`；
- `AgentEventSink`、持久化确认端口、取消信号和恢复输入；
- 上下文、步骤、工具调用、累计等待和总运行时预算。

最小输入协议的职责形态如下，具体 TypeScript 名称可以调整，但不能退回到直接传入
AI SDK `ToolSet` 或 server callback：

```ts
type AgentRunnerInput = {
  modelConfig: ModelConfig;
  transcript: AgentTranscriptMessage[];
  workspace: WorkspaceWorkbookSummary[];
  enabledTools: string[];
  toolExecutor: ToolExecutor;
  eventSink?: AgentEventSink;
  persistenceBarrier?: PersistenceBarrier;
  abortSignal?: AbortSignal;
  runtimeOptions: AgentRuntimeOptions;
};

interface ToolExecutor {
  execute(request: {
    toolName: string;
    toolCallId: string;
    input: unknown;
    context: unknown;
  }): Promise<unknown>;
}
```

`context` 是 Agent 不解释的不透明执行上下文。server 可以在自己的适配器中把它实现为
`{ workspaceId, runId }`，但这些字段不能进入 Agent 包的通用 contract，也不能让 Agent
根据这些字段执行授权判断。授权和具体 ID 语义始终属于 server。

`AgentRunner` 的运行结果必须同时区分两条通道：

- `stream`：面向当前订阅者的实时输出，断开后可以丢失；
- `completion`：一次运行的最终结果和持久化完成状态，不能依赖浏览器是否仍连接。

UI stream adapter 只能消费 `stream`，server persistence adapter 必须等待 `completion`，
不能通过等待 HTTP response 结束来判断 Agent 是否已经完成。

每一个循环边界都遵循同一顺序：

1. `agentLoop.ts` 构造本次模型输入并调用 Vercel AI SDK。
2. 先把 assistant 文本、tool call 或 provider 错误转换成 provider-neutral 事件。
3. 通过 `PersistenceBarrier` 持久化事件并等待 durable acknowledgement，再通过
   `AgentEventSink` 广播已确认事件；持久化失败时停止，不进入下一步。
4. 对 tool call 调用注入的 `ToolExecutor`，只消费结构化结果。
5. 等待工具结果、工作簿事务、撤销快照、工具账本和对应事件全部确认后，才把结果用于下一次模型输入。
6. 达到模型终止、取消、错误或任一预算上限时，生成唯一终态并停止循环。

步骤上限、工具调用上限、模型 deadline 和结果预算必须是显式配置，
超限必须形成可诊断的 run 状态，不能用无限重试或静默截断掩盖。
AgentRunner 不直接写数据库；“持久化确认”由 server 提供的端口实现，
但 AgentRunner 必须把确认视为继续执行的前置条件。

## 7. 持久化和失败策略

### 7.1 持久化原则

- 接受用户请求后，先保存本轮用户消息，再开始模型生成。
- 保存完整 transcript 时只能基于服务端已读取的版本和本轮服务端事件。
- 任何前端分页结果都不能覆盖完整 transcript。
- 模型上下文裁剪只影响本次模型请求，不影响历史保存。
- `AgentRun` 进入 terminal 状态前，必须完成对应的 transcript 收尾和终态事件持久化。
- 工具的 `running` 预约记录可以先于副作用事务提交，用于占用幂等键和恢复判断；但工具副作用、撤销快照、
  完成状态、结构化工具结果、对应完成事件以及 canonical tool-result transcript 必须在同一个数据库事务中提交。
  事务失败时工具结果不得返回为成功。
- Agent 事件和步骤必须先经过持久化确认，再发送为可恢复事件。发送失败可以重连回放，不能反向删除已持久化数据。
- AgentStep 或事件持久化失败时，AgentRunner 必须停止继续调用模型和工具，run 进入 `persistence_failed` 或等价的可诊断状态。
- 持久化失败不能只记录日志后继续 stream；日志只是诊断补充，不是数据可靠性机制。
- transcript 追加和 run 状态更新必须使用版本检查或 session 运行租约，禁止用旧快照覆盖新内容。

### 7.2 失败、取消和断流

必须先区分四类故障，不能把所有错误都归类为“用户断开”：

- **模型/Provider 故障**：429、408、临时 5xx、连接重置、超时或 provider 明确标记的 transient error。
- **Agent 运行故障**：工具 schema、上下文超限、停止条件、协议解析或 Agent 自身异常。
- **服务端持久化故障**：事件、步骤、transcript、工具账本或工作簿事务无法提交。
- **传输故障**：SSE/HTTP 连接中断、代理超时、浏览器离线或客户端主动关闭订阅。

故障分类决定是否重试、是否继续运行以及如何恢复；传输故障本身不能推断
模型是否失败，也不能推断工具是否执行。

### 7.3 Recovery Required 状态与恢复流程

`recovery_required` 是一个特殊的终态，表示run进入需要人工干预或自动恢复的状态。该状态只由以下场景触发：

**触发条件**：

1. **租约丢失**：Agent执行过程中，session租约被其他进程接管（可能是误操作或超时后接管）
2. **持久化失败**：transcript、事件或步骤持久化失败，但工具已执行完成
3. **进程异常退出**：服务进程在run执行中途崩溃，无法确定工具是否成功提交
4. **超时后未完成**：运行超过最大时长限制，且无法确定是否已经完成

**状态特征**：

- `AgentRun.status = "recovery_required"`
- `AgentRun.endedAt` 已设置
- `AgentRun.errorMessage` 包含详细的恢复原因
- session租约已被释放（其他run可以开始）
- transcript可能不完整或未持久化最新消息

**查询接口**：

服务端提供专门的查询接口，用于检测需要恢复的run：

```http
GET /api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs?status=recovery_required
```

响应包含：
- run基本信息（id、创建时间、错误原因）
- 最后一个成功持久化的事件sequence
- 受影响的workbook/sheet列表
- 是否可以自动恢复的标记

**恢复流程**：

1. **自动恢复**（如果可以安全恢复）：
   ```http
   POST /api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs/:runId/recover
   ```

   恢复策略：
   - 检查最后持久化的tool call状态
   - 如果所有工具都已完成，从transcript恢复并标记run为completed
   - 如果存在未完成的工具，根据工具账本判断是否需要重试
   - 如果无法安全恢复，返回需要人工干预的标记

2. **人工干预**（当自动恢复不可行）：
   - 管理员查看run详情和工具执行日志
   - 手动确认每个未完成工具的状态
   - 通过管理接口强制标记run状态
   - 更新transcript和workbook到一致状态

3. **放弃恢复**（用户选择重新开始）：
   ```http
   DELETE /api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs/:runId
   ```

   放弃操作会：
   - 将run标记为abandoned
   - 保留诊断信息供后续分析
   - 不影响session的后续使用

**恢复安全保证**：

- 相同`(runId, toolCallId)`不会重复执行工具副作用
- 恢复操作使用`recovery_required + session.version`条件更新；并发恢复或session已开始新run时返回冲突，不改变旧run状态
- undo checkpoint只有在恢复时读取的session version仍然有效时才会重新挂载，避免旧run覆盖新run的撤销点
- 终态写入失败时，原lease owner使用CAS将仍处于`running`的run转为`recovery_required`
- 当前恢复诊断依赖run、event和tool execution记录；独立恢复审计事件仍属于后续运维能力

**监控与告警**：

- 服务端应监控recovery_required状态的run数量
- 超过阈值时触发告警
- 定期清理超期未恢复的run
- 提供恢复成功率和耗时统计

模型失败：

- 保留用户消息和已有历史。
- run 标记为 `failed`，保存错误分类和错误信息。
- 不保存空 assistant 占位符；如果模型已经产生部分文本，必须保存为带
  `incomplete` 标记的运行事件/步骤，或记录明确的丢弃原因，不能静默丢失。
- 如果部分输出之后没有产生可确认的 tool call，重试时必须使用新的模型尝试
  标识，且不能把上一次部分文本再次拼接到新的 assistant 输出中。
- 后续请求仍然可以继续使用该 session。

用户显式停止：

- 通过独立的取消命令或取消接口向服务端发出 cancel intent。
- 服务端写入取消标记，AgentRunner 在模型调用和工具边界检查取消信号。
- run 标记为 `cancelled`，保存已确认的服务端步骤；已经提交的 workbook 修改不回滚。

客户端连接断开：

- 断流只表示当前订阅者消失，不能默认等同于用户取消。
- 服务端释放 HTTP 连接，但在运行租约有效期内继续 AgentRunner；租约续期由服务端运行任务负责，不依赖浏览器连接。
- 前端重新连接时按 runId 和事件游标回放；若运行已终止，则读取终态 run、canonical transcript 和 workbook 版本摘要。
- 只有显式取消、运行租约过期且无法接管，或进程收到终止信号时，才进入取消、失败或待恢复状态。
- 进程异常退出后，后台恢复器扫描 stale run；恢复只能从最后一个完整持久化边界开始，不能从模型流中间恢复。
- 如果最后边界是已完成的工具调用，恢复时必须从 canonical transcript 和已持久化工具结果重新构造下一次模型输入；如果存在未决的
  `running` 工具记录，必须先依据事务提交结果判定是复用结果还是安全重试。
- 无法证明工具是否提交时进入 `recovery_required`，禁止盲目重复工具或把未确认结果写进 transcript。

重复请求：

- 使用 requestId/clientRequestId 幂等。
- 相同 requestId 且请求体哈希一致时返回已有 run 或附着到已有事件流，不能重复执行 Agent loop。
- 相同 requestId 配不同请求体时返回明确冲突。
- 同一个 `(runId, toolCallId)` 必须返回第一次执行的持久化结果；参数哈希不一致时返回幂等冲突，不能再次执行。
- 已存在其他请求的 active run 时返回明确的 busy/conflict 结果，并提供可查询的 runId。

### 7.3 并发

同一 session 同时只能有一个 active run。必须使用数据库可见的运行租约或等价并发机制，不能只写一个进程内
锁。最小租约字段和行为如下：

- `runId`、`ownerId`、`leaseExpiresAt`、`heartbeatAt` 和单调 `sessionVersion`。
- 创建 run、追加用户消息和取得租约在同一事务中完成；租约续期不能覆盖已变更的 sessionVersion。
- 新请求看到未过期租约时返回 busy；看到过期租约时只能由一个事务原子接管。
- 服务进程退出后，恢复器按最后持久化事件和工具执行记录处理 stale run，不能仅凭内存状态判断工具是否执行。

session 租约用于保护：

- 读取并追加 transcript。
- 创建 run。
- 更新 run terminal 状态。
- 更新 undo checkpoint。

不能通过在服务器进程内缓存一个全局 agent 实例来代替数据库租约。多实例部署时数据库仍必须是权威来源。

### 7.4 模型错误和重试

重试策略只属于 `packages/agent`，服务端只提供取消信号、持久化端口和错误上报端口。默认规则：

- 可重试：429、408、模型提供商的临时 5xx、连接重置、请求超时和明确标记为 transient 的 provider error。
- 不可重试：认证失败、权限失败、请求参数错误、上下文超限、模型或工具 schema 错误，以及其他确定性 4xx。
- 429 优先使用合法的 `Retry-After`；没有该字段时使用指数退避加全抖动：`min(cap, base * 2^attempt) * random(0, 1)`。
- 每次 run 同时受最大尝试次数、最大累计等待时间和请求 deadline 限制；取消信号、进程关闭和 deadline 到期立即停止等待。
- 重试次数、等待时间、错误分类、provider request id 和最终错误必须进入 run/step 诊断信息，不能只写日志。
- 模型流已经产生的部分文本必须作为未完成 assistant 事件保存或明确标记丢弃原因；不能用空 assistant 消息覆盖已有内容。
- 只有在当前模型尝试没有产生已确认的 tool call 或工具副作用时，才可以透明重试模型调用。
  已经产生工具请求的尝试必须先完成工具账本和 transcript 边界，再由 AgentRunner 继续或恢复，不能
  重放整次模型请求来“碰运气”。
- 每次 provider 尝试必须有 attempt id；重试不能重复追加 assistant 文本、tool call 或终态事件。
- 重试模型调用不会自动重试工具副作用。工具只能通过 `(runId, toolCallId, inputHash)` 幂等记录安全重放。

## 8. 数据模型

当前继续使用已有模型，不为迁移第一步重复创建 `ChatMessage` 表：

```prisma
model Session {
  id           Int        @id @default(autoincrement())
  publicId     String     @unique
  workspaceId  Int
  sheetId      Int?
  name         String
  titleStatus  String     @default("pending")
  chatMessages String?    @default("[]")
  undoRunId    Int?
  runs         AgentRun[]
  createdAt    DateTime   @default(now())
}
```

`Session.chatMessages` 是当前 canonical transcript 的存储位置。`AgentRun` 和 `AgentStep` 是执行审计、
失败诊断、工具结果和撤销的补充记录，不是让前端重新构造上下文的来源。

事件回放和工具级幂等需要补充持久化记录，但它们不能成为第二份 transcript 事实来源。最小字段契约如下，
具体表名可以按现有 Prisma 命名调整：

```prisma
model AgentEvent {
  id          Int      @id @default(autoincrement())
  runId       Int
  eventId     String   @unique
  sequence    Int
  type        String
  occurredAt  DateTime
  payload     String
  createdAt   DateTime @default(now())

  @@unique([runId, sequence])
}

model AgentToolExecution {
  id           Int      @id @default(autoincrement())
  runId        Int
  toolCallId   String
  toolName     String
  input        String
  status       String
  output       String?
  errorMessage String?
  startedAt    DateTime @default(now())
  endedAt      DateTime?
  updatedAt    DateTime
  createdAt    DateTime @default(now())

  @@unique([runId, toolCallId])
}
```

`AgentEvent` 是流回放日志，`AgentToolExecution` 是工具副作用幂等账本，二者都不能被浏览器写入。
工具执行记录必须先进入 `running`。当前实现已经在工具执行前占用幂等键，在完成后保存结构化结果；遇到
`completed` 直接复用结果，参数不一致拒绝执行，短时间内的 `running` 拒绝并发重复调用，超时 `running` 才允许回收。
当前有副作用的 Sheet、Workbook 和 Chart Agent 工具由各自的 server application/service 管理短事务；
工具账本通过 mutation receipt 和 stale running 回收保持幂等，不把数据库 transaction 注入 Agent 或通用工具执行上下文。
canonical tool-result transcript 仍由 Agent event/persistence 边界负责，后续继续补齐事件回放和持久化失败诊断。

`AgentRun` 至少要能区分以下状态：

- 非终态：`pending`、`running`、`detached`。
- 正常终态：`completed`。
- 可诊断终态：`failed`、`cancelled`、`persistence_failed`、`recovery_required`。

`detached` 只表示没有当前浏览器订阅者，不表示 Agent 已停止。所有终态必须有 `endedAt`、最终事件和
错误分类（如果有）；状态转换必须由服务端按允许的状态图执行，不能由前端提交状态。

当前实现已为 `AgentRun` 增加 `cancelRequestedAt DateTime?`，用于持久化显式取消意图；它不属于 `Session`，也不由浏览器直接修改运行状态。

`AgentRun` 还必须保存或可查询以下运行控制字段：`requestId`、请求体哈希、`ownerId`、`leaseExpiresAt`、
`heartbeatAt`、`lastEventSequence`、`startedAt`、`endedAt` 和错误分类。`requestId` 在草稿阶段按 workspace
和请求命名空间去重，session 创建后继续与 session 关联，不能因为 draft 没有 sessionId 而失去幂等性。

## 9. 代码模块边界

### `packages/web/src/features/chat`

- 管理输入和渲染。
- transport 只提交单轮用户消息。
- 消费服务端 stream。
- 断流后重新读取服务端状态。
- 不负责 transcript 合并和 agent loop。

### `packages/server/src/modules/sessions/api`

- 校验请求体。
- 解析公共资源 ID。
- 区分显式 cancel command 与 HTTP 连接生命周期。
- 调用应用服务。
- 输出 HTTP/stream 响应。

路由不应直接拼装模型上下文或写 Prisma。

### `packages/server/src/modules/sessions/application`

- 会话轮次用例。
- canonical transcript 读取、追加和去重。
- run 生命周期编排。
- requestId/messageId 请求哈希和冲突处理。
- session 运行租约、stale run 接管和恢复决策。
- 标题和撤销等独立用例。

### `packages/server/src/modules/sessions/chat`

- workspace context 加载、引用解析和资源授权。
- 创建 `AgentRunner` 的服务端适配器、`ToolExecutor` 和持久化端口。

其中 `runs/agentPersistence.ts` 只负责 server 侧的持久化适配：记录工具执行账本、回放已完成调用、
并在失败时标记执行失败；具体 sheet 副作用仍由 `sheets/tools/runSheetMutation.ts` 和 sheets application 完成。
该适配器不负责模型循环、上下文裁剪或工具选择。
- 协调 Agent 事件、transcript、run/step 和 HTTP stream。
- 不实现模型循环、上下文裁剪、重试退避或停止条件。

### `packages/server/src/modules/sessions/infrastructure`

- Prisma session repository。
- session 运行租约、版本检查和并发保护。
- 不包含 React 或 AI SDK UI 状态。

### `packages/server/src/modules/sessions/runs`

- run/step 持久化。
- `agentEventRepository.ts` 负责 AgentEvent 追加，并在同一事务中写入 AgentStep。
- `toolExecutionRepository.ts` 负责 `(runId, toolCallId)` 账本、参数一致性和结果回放。
- `agentPersistence.ts` 负责将 Agent 端口适配到上述 repository；不包含 HTTP 和 Agent loop。
- 事件游标和回放查询（待补齐）。
- undo checkpoint 和运行结果。
- 运行状态恢复和幂等查询。

### `packages/agent/src/runtime`

- `AgentRunner` facade、运行生命周期和运行结果。
- `agentLoop` 对 Vercel AI SDK `streamText`/`ToolLoopAgent` 的内部适配。
- model-facing message 转换与 system prompt 组装。
- 上下文窗口裁剪和工具结果预算；软压缩仍属于后续能力。
- 工具循环、停止条件、模型错误格式化和运行时事件。
- 面向服务端的 `ToolExecutor`、事件 sink、取消端口和恢复边界。

当前实现已按以下职责拆分，后续扩展不得将这些边界合并回 server：

- `runtime/loop/agentRunner.ts`：运行 facade、依赖组装和终态协调，不承载所有 loop 细节。
- `runtime/loop/agentLoop.ts`：唯一的模型/工具 loop 执行模块，内部使用 Vercel AI SDK。
- `runtime/tools/toolAdapter.ts`：将 Agent 工具协议转换成 AI SDK `ToolSet`，不执行 server 业务逻辑。
- `runtime/retryPolicy.ts`：规划中的错误分类、Retry-After、指数退避、抖动和预算模块，当前仍由 AI SDK 配置承载。
- `runtime/events/events.ts`：provider-neutral 事件和事件序列生成，不负责落库或发送 HTTP。
- `runtime/contracts.ts`：`ToolExecutor`、`AgentEventSink`、持久化确认、取消信号和恢复输入接口。
- `runtime/stream/uiStreamAdapter.ts`：只负责 AI SDK UI message stream 传输适配。
- `runtime/stream/referencePart.ts`：将 `data-chat-reference` part 转换为模型可读的文本。
- `runtime/tools/toolResultBudget.ts`：工具结果 token 预算和超限截断。
- `runtime/errors/formatAIError.ts`：模型错误到用户可读消息的格式化。
- `session/context.ts`、`session/transcript.ts`：model-facing context 和 transcript 转换。

该目录是 Agent 行为的唯一实现位置。服务端的 `sessions/chat` 只能创建适配器、消费 Agent
事件并持久化，不能复制一份 server-side loop。

不得让该包读取数据库、依赖 HTTP/Fastify、执行具体数据库工具，或信任浏览器发送的完整 transcript。

## 10. 迁移阶段

### Phase 0：文档和测试基线

- 将本文件作为 Agent loop 的唯一详细依据，并让 `docs/architecture.md` 只保留稳定包边界。
- 增加服务端 transcript 合并测试。
- 增加分页历史不能覆盖旧消息的回归测试。
- 增加严格 UserTurnRequest schema、请求哈希冲突和重复 requestId 测试。
- 增加断流不取消、显式取消、stale run 接管和恢复测试。
- 增加工具事务、工具级幂等、参数哈希冲突和重复工具调用测试。
- 增加 429/Retry-After/408/5xx/超时/不可重试错误和取消等待测试。
- 增加事件 sequence、断点回放、重复事件去重和终态快照测试。
- 增加模型调用中途进程退出、工具事务前退出、工具事务后退出和持久化失败恢复测试。

### Phase 1：服务端先获得权威性

- 在 session application 层读取完整 transcript。
- 在服务端合并本轮 user message。
- 服务端保存完整 transcript 后再启动模型。
- 服务端调用 `packages/agent` 的 AgentRunner，并通过端口注入授权上下文、工具执行器和持久化回调。
- 不在 `packages/server` 重新实现模型循环、上下文裁剪、重试或停止条件。
- 不兼容旧 `{ messages: [] }` 请求；旧请求必须在 HTTP 边界被拒绝。
- 任何进入 AgentRunner 的历史都必须来自服务端 canonical transcript，不能来自请求体或浏览器状态。

### Phase 1.5：稳定 Agent 内核边界

这一阶段先完成 `packages/agent` 内部重构，再扩展 server 的事件持久化。目标是让 Agent
内核可以在没有 HTTP、Prisma 和 React 的环境中独立测试和运行：

当前状态：内核边界、服务端基础持久化和基础运行取消边界已落地。`AgentRunner` 已收敛为 facade，模型/工具循环位于
`runtime/loop/agentLoop.ts`；工具定义由 server 从 core capability contract 和当前授权策略
组装后通过 `AgentToolDefinition` 注入，具体执行通过
`ToolExecutor` 注入；事件通过 `PersistenceBarrier` 确认后才广播；UI stream 与
运行 completion 已分离。server 的 `agentPersistence` 适配器已接入事件落库、步骤事务落库和工具完成结果回放。
本轮进入运行可靠性阶段：数据库级 session run lease 和有副作用工具事务已落地，随后继续处理工具失败诊断、事件回放和进程恢复。

- 将 `AgentRunner` 收敛为 facade，模型/工具循环移动到 `runtime/loop/agentLoop.ts`。
- 在 `runtime/contracts.ts` 定义 `ToolExecutor`、`AgentEventSink`、`PersistenceBarrier`、
  取消信号和恢复输入。
- `AgentRunner` 不再接收 server 直接组装的 AI SDK `ToolSet`；`runtime/tools/toolAdapter.ts`
  在 Agent 包内部完成 Agent tool contract 到 Vercel AI SDK tool set 的转换。
- 保留 Vercel AI SDK 作为底层执行引擎，第一阶段继续使用 `streamText + stopWhen`；
  未来切换 `ToolLoopAgent` 时不得改变 OpenExcel 对外 contract。
- 将 provider-neutral `AgentEvent` 与 AI SDK UI stream 适配分离；UI stream 只能由
  `runtime/stream/uiStreamAdapter.ts` 负责。
- 任何 Agent event sink 或持久化确认失败都必须让运行停止，禁止仅记录日志后继续执行。
- 为 AgentRunner、agentLoop、toolAdapter、事件顺序、取消和持久化 barrier 增加包内测试，
  测试不得依赖 server 数据库或 HTTP。

#### Phase 1.5a：数据库级运行租约（当前实施项）

运行租约属于 `packages/server` 的运行控制层，不属于 Agent 内核。它解决的是同一个 session
在多请求、多进程下只能有一个 Agent loop 持有执行权的问题。

`Session` 保存当前 session lease：

- `leaseOwnerId`：随机生成的运行 owner token，不使用进程名或用户可控值。
- `leaseExpiresAt`：租约过期时间。
- `leaseHeartbeatAt`：最近一次续租时间。
- `version`：单调递增的 session 版本。

`AgentRun` 同时保存取得租约时的 `ownerId`、`sessionVersion`、`leaseExpiresAt`、`heartbeatAt`
和 `lastEventSequence`，用于诊断、恢复和事件断点。创建 run 的事务顺序固定为：

1. 读取并校验 workspace/session 归属和 requestId 幂等记录。
2. 判断 session lease 是否为空或已过期；未过期则返回 busy。
3. 过期 lease 对应的 `running` run 先转为 `recovery_required`，不能静默覆盖。
4. 条件更新 session lease 并递增 `version`；更新条数必须为 1。
5. 在同一事务中从数据库读取 canonical transcript，追加本轮 user message，写回 transcript，创建 `running` AgentRun。

续租和释放都必须带 `sessionId + ownerId + sessionVersion` 条件。续租失败表示 owner 已失效，
Agent loop 必须停止；释放只清理自己持有的 lease，不能清理后来 owner 的 lease。进程内
`withSessionLock` 只能降低同进程竞争，不能作为正确性保证。

本阶段验收：两个并发请求最多一个拿到 lease；过期 lease 只能被一个请求接管；旧 owner
不能续租或释放新 owner 的 lease；同一事务失败时 transcript、run 和 lease 不得部分提交。

这一阶段不新增浏览器上下文能力，也不把数据库模型直接引入 `packages/agent`。取消标记、状态转换和取消信号属于 server 的运行控制层，Agent 只接收抽象的 `AbortSignal`。

### Phase 2：前端切换单轮请求

- transport 只发送本次 user message、引用 ID 和 requestId。
- `onRunSettled(finishedMessages)` 不再参与持久化，只触发 session 元数据刷新。
- 删除前端把完整 `messages[]` 当作服务端事实来源的代码路径。
- 保留本地消息状态用于展示和流式动画。

### Phase 3：断流恢复

- 前端断流后查询 session messages、runs 和 workbook，并按 run event cursor 回放未收到的事件。
- 对已完成的服务端工具修改执行局部或完整工作区刷新；刷新依据服务端版本摘要，不依据本地猜测。
- 增加并验收 run event replay 接口、Last-Event-ID/cursor 和终态快照。
- 不让浏览器通过重发 transcript 恢复 Agent loop。

#### 3.1 当前回放接口契约

服务端提供两个只读接口，二者都先通过 workspace/session 资源边界校验 run 所属关系：

```text
GET /api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs/:runId
GET /api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs/:runId/events?after=<sequence>&limit=<n>
```

run 快照只返回运行状态、时间、终态输出/错误、取消标记和 `lastEventSequence`，不返回
system prompt、模型上下文或工具定义。事件接口按 `sequence > after` 查询，默认从头回放，单页最多
500 条，并返回：

```json
{
  "run": { "runId": 12, "status": "completed", "terminal": true },
  "events": [{ "eventId": "...", "sequence": 3, "type": "run.completed", "payload": {} }],
  "cursor": { "after": 3, "lastEventSequence": 3 },
  "hasMore": false
}
```

前端只保存已经应用的 sequence，断流后使用该 cursor 请求下一页；收到重复请求或重连时，服务端的
`sequence > after` 条件保证不会返回 cursor 之前的事件。终态快照与事件页一起返回，前端不需要通过
重发用户消息来判断运行是否结束，也不得因为 SSE 断开再次启动模型或工具。

#### 3.2 当前前端断流恢复流程

流式响应建立后，服务端通过 `X-OpenExcel-Run-Id` 返回本次 `AgentRun` 的 ID；该响应头与草稿会话头
一起通过 CORS 暴露。浏览器只把它作为恢复索引保存，不把它转换为模型输入。

恢复由 `packages/web/src/features/chat/hooks/runRecovery.ts` 负责：

1. SSE/transport 断开时，使用当前 `runId` 和已应用的 `after` 游标读取事件页。
2. 每次响应只推进到服务端返回的最大 sequence；重复事件不会回退游标，也不会触发工具执行。
3. 运行未终止时按固定短间隔重新查询；运行终止后读取服务端 canonical messages，并刷新 workbook。
   达到恢复期限仍未终止时必须保留错误/恢复中状态，不能调用 settled 回调或隐藏错误。
4. 页面重新进入已有 session 时，先查询 session 下仍为 `running` 的 run，执行相同的恢复流程。
5. 草稿请求断流时先完成服务端 session 激活；后续 session 页面通过运行记录发现该 run，不重发用户消息。

恢复过程不使用浏览器内存中的完整 transcript 作为事实来源，不向 chat endpoint 重发任何历史消息，
也不从 `AgentEvent.payload` 重新执行工具。事件回放只用于推进诊断/恢复游标，最终消息展示以服务端
持久化 transcript 为准。

### Phase 4：协议收紧与可靠性补齐

- 删除旧的 `{ messages: [] }` 请求兼容分支。
- 将 `AgentStep.type/status` 收敛为受限类型并在边界校验。
- AgentEvent 和 AgentToolExecution 的正式基础持久化已启用，不允许用浏览器 transcript 替代它们。
- 将工具账本、工作簿副作用、撤销快照和 canonical tool-result transcript 放入同一事务，并补充事件游标回放、断流恢复和显式 cancel。

当前进度：Phase 1.5a 的数据库级 session lease 已落地；Sheet、Workbook 和 Chart 的有副作用 Agent 工具保留各自
application/service 的短事务，并通过 mutation receipt 与工具账本实现幂等；run 快照、事件游标回放接口和前端断流恢复接入已落地，
跨进程 stale run 恢复、恢复超时后的人工诊断入口和真正的跨进程 Agent run 接管仍待完成。

## 11. 验收标准

以下场景必须由服务端测试覆盖：

1. 会话超过前端首屏分页大小后，新消息不会删除旧消息。
2. 前端只提交本轮用户消息时，模型仍能读取服务端完整历史。
3. 前端篡改或遗漏历史消息，不会改变服务端 canonical transcript。
4. 工具执行和工具结果只由后端产生并入库。
5. 模型失败时用户消息和旧历史仍然存在。
6. 连接在工具提交后断开时，工作簿修改仍然存在。
7. 重复 requestId 不会重复执行工具。
8. 断流后重新打开会话可以恢复已持久化消息和 run 状态。
9. 上下文裁剪不会修改数据库中的完整 transcript。
10. 前端只渲染后端事件，不会自行推进 Agent loop。
11. 连接断开但没有显式取消时，AgentRun 可以继续完成或进入可恢复状态。
12. 同一个 `(runId, toolCallId)` 重放只返回原工具结果，不重复修改 Sheet。
13. 工具事务失败时不会产生成功工具事件、错误撤销快照或半提交工作簿。
14. AgentStep、AgentEvent 或 transcript 持久化失败时不会继续执行后续工具。
15. 429 按 Retry-After 或带抖动的指数退避执行，并受次数、总耗时和取消信号约束。
16. 断点回放按 sequence 去重，最终 transcript 与 workbook 版本摘要一致。
17. 进程异常退出后 stale run 不会永久占用 session，也不会盲目重复未确认的工具调用。

## 12. 明确禁止的实现

以下实现不符合本架构：

- `POST /chat` 接收完整前端 `messages[]` 并直接传给模型。
- 服务端用前端分页消息覆盖 `Session.chatMessages`。
- 前端执行 workbook、sheet 或 chart tool。
- 前端生成 tool result 再回传给模型。
- 前端决定 system prompt、工具列表或上下文窗口。
- 用 React 内存状态作为恢复会话的唯一来源。
- 用单实例全局 agent 缓存代替数据库 transcript 和 session 锁。
- 因 SSE 断开而假设工具没有执行或主动回滚已提交的工作簿修改。
- 把 HTTP 连接断开当作用户取消。
- 在 AgentStep 或事件持久化失败后继续调用模型或工具。
- 没有 `(runId, toolCallId)` 幂等账本就重试有副作用的工具。
- 用 `UIMessage` 中客户端提供的 assistant/tool/system part 作为模型上下文。

## 13. 与 edge-pi 的对应关系

`edge-pi` 是单进程 SDK：调用方提交 prompt，`CodingAgent` 从 `SessionManager` 恢复消息、执行模型和
工具循环，再追加保存结果。OpenExcel 应借鉴它的职责边界，但不能照搬其进程内状态：

- `SessionManager` 对应 OpenExcel 的 session application + repository。
- `CodingAgent` 对应 OpenExcel 的 `packages/agent` `AgentRunner` facade；其内部的
  `ToolLoopAgent` 对应 OpenExcel 的 `runtime/loop/agentLoop.ts` 和 Vercel AI SDK 适配层。
- edge-pi 的 `EdgePiRuntime` 对应 OpenExcel 的 `ToolExecutor`，但 OpenExcel 的具体实现由
  server 负责授权并执行 workbook/sheet/chart 操作。
- edge-pi 的 session 自动追加逻辑不能直接搬入 OpenExcel Agent；OpenExcel 必须由 server
  通过 `AgentEventSink` 和 `PersistenceBarrier` 控制数据库提交顺序。
- server chat orchestration 只对应 edge-pi 的 session 持久化、授权和 runtime 端口适配部分。
- edge-pi 的 CLI/App 对应 OpenExcel 的浏览器，但浏览器只能提交本轮输入和渲染结果。
- OpenExcel 的数据库 transcript 负责跨请求、跨实例恢复。

因此，edge-pi 的“调用方传 prompt”是本项目目标协议；“前端传完整 messages”不是目标协议。

## 14. Future Refactor Workflow

所有后续 Agent 重构按以下顺序进行：

1. 先在本文档写清楚目标行为、边界、状态转换、持久化顺序和失败恢复方式，并标记当前实现与目标的差距。
2. 在 `packages/agent` 定义或调整 AgentRunner、上下文、工具端口、事件和重试策略；Agent 不得为适配 server 而引入 HTTP 或数据库依赖。
3. 在 `packages/server` 实现授权、事务、租约、幂等账本、事件落库和传输适配；server 不得复制 Agent loop。
4. 在 `packages/web` 接入单轮请求、事件渲染、断流回放和版本刷新；web 不得生成模型上下文或 tool result。
5. 为模型失败、持久化失败、工具重复、工具提交后断流、进程退出、429 退避和上下文裁剪补齐测试。
6. 只有在包边界或顶层数据流确实变化时，才同步修改 `docs/architecture.md`；其余 Agent 细节只维护在本文档。

实现完成后，必须回看本文档的验收标准和禁止清单；没有通过这些标准，不能把一次能跑通的流式演示视为 Agent 重构完成。
