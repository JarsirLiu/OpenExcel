# Agent 系统架构与迁移方案

本文档是 OpenExcel Agent 系统的职责边界、消息协议和改造基线。它覆盖
`packages/web`、`packages/server`、`packages/agent` 之间的协作方式。

本文档的最高优先级原则是：

> 前端不参与 Agent loop，不组装模型上下文，不执行工具，也不保存权威 transcript。
> 服务端从持久化会话恢复上下文，调用 `packages/agent` 的 AgentRunner 执行完整 Agent loop，
> 保存运行结果，再通过流式事件通知前端。

本文档替代旧的“前端提交完整 AI SDK messages，由服务端直接转发给 Agent”的规划。旧协议只能作为
迁移期间的兼容输入，不能作为最终架构。

## 1. 当前基线

当前项目已经具备后端执行工具和运行记录的基础能力：

- `AgentRun` 记录一次 Agent 执行的状态、模型、输入、输出和错误。
- `AgentStep` 记录模型步骤、工具名、输入、输出和顺序。
- workbook、sheet、chart 工具都由 `packages/server` 注册和执行。
- 工具产生的工作簿修改和撤销快照由服务端持久化。
- `Session.chatMessages` 保存 AI SDK UI message transcript。
- `packages/agent` 负责模型调用、工具循环、上下文预算和 UI stream 转换。
- `packages/web` 使用 AI SDK React hooks 消费流并渲染消息、工具状态和工作簿刷新。

当前仍存在一个必须修正的边界问题：

- 前端 `useChat` 持有的 `messages[]` 被作为聊天请求体发送到服务端。
- 服务端目前直接使用这批前端消息构造模型输入。
- 前端只加载最近一页消息时，这批消息可能不完整。
- 流结束时如果用这批消息覆盖 `Session.chatMessages`，旧历史会丢失。

因此当前实现是过渡状态，不能把“前端提交 transcript”视为目标架构。

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
- 解析 workbook/sheet 引用并使用服务端权威名称和 ID。
- 创建 `AgentExecution` 所需的服务端适配器和持久化端口。
- 执行 Agent 请求的具体 workbook/sheet/chart 工具，保存工具步骤和工作簿修改。
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
- 工具调用协议、工具循环和停止条件。
- 模型限流错误分类、指数退避和单次运行的重试预算。
- 把工具请求交给注入的 `ToolExecutor`，接收结果后继续循环。
- 产出与传输无关的 Agent 事件，以及可选的 AI SDK UI stream 适配。

`packages/agent` 不负责：

- Prisma 查询。
- workspace/session 授权。
- HTTP 路由。
- React 状态。
- 直接决定某个用户是否有权读取 workbook 或 sheet。
- 具体 workbook/sheet/chart 数据库工具实现。
- AgentRun、AgentStep 或 transcript 的数据库持久化。

服务端可以把完整的 canonical transcript 和已授权的运行上下文传给 agent，但 agent 不应从浏览器接收或信任一份完整历史。
Agent 引擎只依赖显式输入和端口，不依赖 `packages/server`；服务端不得在 `sessions/chat` 中重新实现
模型循环、上下文裁剪、重试或停止条件。

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
Server
  ├─ 保存 AgentStep
  ├─ 保存 assistant/tool transcript
  ├─ 完成 AgentRun
  └─ 流式返回事件
       ↓
Browser
  └─ 渲染事件，必要时重新读取服务端状态
```

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

目标实现必须在现有 session/run 资源边界下提供 Agent event stream：

```ts
type AgentEvent =
  | { type: "run.started"; runId: number }
  | { type: "message.started"; runId: number; messageId: string; role: "assistant" }
  | { type: "message.delta"; runId: number; messageId: string; text: string }
  | { type: "message.completed"; runId: number; messageId: string }
  | { type: "tool.started"; runId: number; stepId: number; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool.completed"; runId: number; stepId: number; toolCallId: string; toolName: string; result: unknown }
  | { type: "tool.failed"; runId: number; stepId: number; toolCallId: string; toolName: string; error: AgentError }
  | { type: "run.completed"; runId: number }
  | { type: "run.failed"; runId: number; error: AgentError }
  | { type: "run.cancelled"; runId: number }
  | { type: "run.detached"; runId: number };

type AgentError = {
  code: string;
  message: string;
  retryable: boolean;
  providerRequestId?: string;
};
```

每个事件通过统一信封传输，并在服务端持久化后才允许进入可恢复流：

```ts
type PersistedAgentEvent = {
  eventId: string;
  runId: number;
  sequence: number;
  occurredAt: string;
  event: AgentEvent;
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
9. AgentRunner 接收已持久化的工具结果并决定继续、重试或结束；服务端持久化每个权威事件和步骤。
10. 服务端追加 assistant/tool 消息，完成 transcript 收尾，再将 run 置为 terminal 状态。
11. 服务端把已持久化的 Agent 事件转换为 stream 返回前端；前端只更新 UI。

第 7 至第 10 步由 `packages/agent` 的引擎和服务端注入的工具适配器共同完成，但循环控制权只属于
AgentRunner。浏览器不能因为没有收到某个事件就重新执行工具或重新组装下一轮消息。

## 6. 工具调用边界

工具调用的唯一执行方是服务端。一次有副作用的工具调用必须遵循以下顺序：

```text
AgentRunner emits tool request
    ↓
server ToolExecutor validates input and authorization
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

前端的 `useSheetPatchSync` 或工作簿刷新逻辑只能做显示同步，不能作为工具执行成功的判断依据。
数据库提交和 `AgentStep` 才是事实来源。

工具实现继续放在对应领域：

- `packages/server/src/modules/sheets/tools/`
- `packages/server/src/modules/workbooks/tools/`
- `packages/server/src/modules/charts/tools/`

不应把工具执行移动到 `packages/web`，也不应让前端回传 tool result 作为模型上下文。

## 7. 持久化和失败策略

### 7.1 持久化原则

- 接受用户请求后，先保存本轮用户消息，再开始模型生成。
- 保存完整 transcript 时只能基于服务端已读取的版本和本轮服务端事件。
- 任何前端分页结果都不能覆盖完整 transcript。
- 模型上下文裁剪只影响本次模型请求，不影响历史保存。
- `AgentRun` 进入 terminal 状态前，必须完成对应的 transcript 收尾和终态事件持久化。
- 工具副作用、工具执行记录和撤销快照必须在同一个数据库事务中提交；事务失败时工具结果不得返回为成功。
- Agent 事件和步骤必须先经过持久化确认，再发送为可恢复事件。发送失败可以重连回放，不能反向删除已持久化数据。
- AgentStep 或事件持久化失败时，AgentRunner 必须停止继续调用模型和工具，run 进入 `persistence_failed` 或等价的可诊断状态。
- 持久化失败不能只记录日志后继续 stream；日志只是诊断补充，不是数据可靠性机制。
- transcript 追加和 run 状态更新必须使用版本检查或 session 运行租约，禁止用旧快照覆盖新内容。

### 7.2 失败、取消和断流

模型失败：

- 保留用户消息和已有历史。
- run 标记为 `error`，保存错误信息。
- 不保存空 assistant 占位符。
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
- 重试模型调用不会自动重试工具副作用。工具只能通过工具级幂等记录安全重放。

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
  eventId     String   @unique
  runId       Int
  sequence    Int
  type        String
  payload     String
  createdAt   DateTime @default(now())

  @@unique([runId, sequence])
}

model AgentToolExecution {
  id           Int      @id @default(autoincrement())
  runId        Int
  toolCallId   String
  toolName     String
  inputHash    String
  status       String
  result       String?
  error        String?
  committedAt  DateTime?
  createdAt    DateTime @default(now())

  @@unique([runId, toolCallId])
}
```

`AgentEvent` 是流回放日志，`AgentToolExecution` 是工具副作用幂等账本，二者都不能被浏览器写入。
工具执行记录必须先进入 `running`，并在工作簿修改、撤销快照和结果写入同一事务后变为 `completed`；恢复时
遇到 `completed` 直接复用结果，遇到 `running` 必须依据事务结果和租约判定，不能直接再次执行。

`AgentRun` 至少要能区分以下状态：

- 非终态：`pending`、`running`、`detached`。
- 正常终态：`completed`。
- 可诊断终态：`failed`、`cancelled`、`persistence_failed`、`recovery_required`。

`detached` 只表示没有当前浏览器订阅者，不表示 Agent 已停止。所有终态必须有 `endedAt`、最终事件和
错误分类（如果有）；状态转换必须由服务端按允许的状态图执行，不能由前端提交状态。

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
- 协调 Agent 事件、transcript、run/step 和 HTTP stream。
- 不实现模型循环、上下文裁剪、重试退避或停止条件。

### `packages/server/src/modules/sessions/infrastructure`

- Prisma session repository。
- session 运行租约、版本检查和并发保护。
- AgentEvent、AgentToolExecution、AgentRun 和 transcript 的事务写入。
- 不包含 React 或 AI SDK UI 状态。

### `packages/server/src/modules/sessions/runs`

- run/step 持久化。
- 事件追加、事件游标和回放查询。
- 工具执行账本和工具结果复用。
- undo checkpoint 和运行结果。
- 运行状态恢复和幂等查询。

### `packages/agent/src/runtime`

- AgentRunner 和模型调用。
- model-facing message 转换与 system prompt 组装。
- 上下文窗口、工具结果预算和上下文压缩。
- 工具循环、停止条件、错误分类、指数退避和运行时事件。
- 面向服务端的 `ToolExecutor`、事件 sink、取消端口和恢复边界。

建议拆分为以下职责明确的内部模块，名称可调整但边界不能合并回 server：

- `runtime/agentRunner.ts`：唯一的模型/工具 loop 和状态推进器。
- `runtime/retryPolicy.ts`：错误分类、Retry-After、指数退避、抖动和预算。
- `runtime/events.ts`：provider-neutral 事件和事件序列生成，不负责落库。
- `runtime/contracts.ts`：`ToolExecutor`、取消信号、持久化确认和恢复输入接口。
- `session/context.ts`、`session/transcript.ts`：model-facing context 和 transcript 转换。

该目录是 Agent 行为的唯一实现位置。服务端的 `sessions/chat` 只能创建适配器、消费 Agent
事件并持久化，不能复制一份 server-side loop。

不得让该包读取数据库、依赖 HTTP/Fastify、执行具体数据库工具，或信任浏览器发送的完整 transcript。

## 10. 迁移阶段

### Phase 0：文档和测试基线

- 将本文件和 `docs/architecture.md` 统一为后端权威会话模型。
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
- 暂时可以兼容旧 `{ messages: [] }` 请求，但旧 messages 只能用于提取本轮用户消息，不能覆盖数据库历史。
- 兼容分支必须经过同一个严格的 UserTurnRequest 规范化函数，禁止把旧消息数组传入 AgentRunner。

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

### Phase 4：协议收紧

- 删除旧的 `{ messages: [] }` 请求兼容分支。
- 将 `AgentStep.type/status` 收敛为受限类型并在边界校验。
- 启用 AgentEvent 和 AgentToolExecution 的正式持久化，不允许用浏览器 transcript 替代它们。

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
- `CodingAgent` 对应 OpenExcel 的 `packages/agent` `AgentRunner`；server chat orchestration 只对应
  `SessionManager` 的持久化、授权和端口适配部分。
- edge-pi 的 CLI/App 对应 OpenExcel 的浏览器，但浏览器只能提交本轮输入和渲染结果。
- OpenExcel 的数据库 transcript 负责跨请求、跨实例恢复。

因此，edge-pi 的“调用方传 prompt”是本项目目标协议；“前端传完整 messages”不是目标协议。
