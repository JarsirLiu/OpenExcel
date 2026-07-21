# 标准化 Agent 系统实施方案

本文档用于记录当前项目 Agent 系统的实现基线和后续演进方案。文档不是接口契约；实际行为以
`packages/agent`、`packages/server/src/modules/sessions` 和 Prisma schema 为准。

> **当前基线（2026-07-21）**：AgentRun、AgentStep、工具调用、流式中断、会话消息持久化和
> workbook undo 已经落地。本文档中标记为“已实现”的内容是当前基线；“规划”部分是尚未完成的
> 演进方向。不要按旧的 Phase 1 重新创建已经存在的模型或接口。

## 1. 当前实现基线与剩余问题

当前代码已经具备 Agent 运行的基本闭环：

1. **运行和步骤已经落库**
   - `AgentRun` 记录运行状态、模型、输入、输出、错误和时间。
   - `AgentStep` 记录模型步骤、工具名、输入、输出和顺序。
   - `AgentRunSheetSnapshot` 支持工具修改工作簿后的撤销。
   - `AgentRunChartSnapshot` 支持图表变更的撤销和关联 Sheet 恢复。

2. **消息仍以 JSON transcript 为主**
   - `Session.chatMessages` 保存 AI SDK UI message transcript。
   - `AgentRun.inputText` 和 `outputText` 提供历史回放的降级来源。
   - 当前没有独立的 `ChatMessage` 表，也没有把每个 message part 单独结构化落库。

3. **运行协议采用现有聊天传输**
   - 前端通过 AI SDK `useChat()` 发送和接收 UI message stream。
   - 服务端在 workspace/session 作用域下创建和完成 `AgentRun`，并在 step 完成时写入 `AgentStep`。
   - 客户端断开连接会触发 abort；当前没有独立的运行事件回放总线。

4. **仍待解决的边界**
   - 运行详情和步骤查询目前是嵌套在 session 下的读取接口，没有独立的事件流接口。
   - `AgentStep.type` 和 `status` 仍是字符串，尚未收敛为跨包共享的判别联合类型。
   - 部分聊天边界仍使用 AI SDK 类型之外的运行时数据，需要逐步减少 `any`。
   - reasoning/tool parts 已支持前端展示，但持久化和回放仍以 transcript 与 run 摘要为主。

---

## 2. 目标定义

将当前聊天系统升级为一个标准化 Agent 系统：

> 一个 Session 下允许多次 Agent Run；每次 Run 可包含思考、工具调用、工具结果、最终回答；前端可实时展示；后端可追踪与恢复；数据库可审计与回放。

---

## 3. 系统分层

建议把系统拆成四层：

### 3.1 会话层 Session

表示用户和 AI 在某个 Sheet / Workspace 下的一段长期对话。

- 作为容器，不直接等同于一次回答。
- 一个 Sheet 可对应多个 Session。

### 3.2 运行层 Run

表示一次用户提问对应的一次完整 Agent 执行。

- 有状态：`pending / running / completed / failed / aborted`。
- 一个 Session 下可以有多个 Run。

### 3.3 步骤层 Step

记录 Agent 执行中的每个可展示节点。

- `thinking`
- `tool_call`
- `tool_result`
- `final`
- `error`

### 3.4 消息层 Message

保留用户原始输入、系统提示、assistant 最终回复等消息，但不把它作为唯一的数据模型。

---

## 4. 当前数据模型

下面是当前 Prisma 模型的职责摘要，不是建议中的待创建 schema。字段变更必须同时更新 SQLite、
PostgreSQL、MySQL schema 和迁移。

### 4.1 Session

`Session` 是 workspace 下的会话容器。`sheetId` 可以为空；会话消息暂存在 JSON 字段中，运行记录
通过 `runs` 关联。

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

### 4.2 AgentRun

一次用户请求对应一个 `AgentRun`。`clientRequestId` 用于草稿会话幂等，`undoInvalidated`、
`revertedAt` 用于撤销生命周期。

```prisma
model AgentRun {
  id               Int      @id @default(autoincrement())
  sessionId        Int
  clientRequestId  String?  @unique
  status           String
  model            String?
  systemPrompt     String?
  inputText        String?
  outputText       String?
  errorMessage     String?
  undoInvalidated  Boolean  @default(false)
  revertedAt       DateTime?
  startedAt        DateTime @default(now())
  endedAt          DateTime?
  steps            AgentStep[]
  snapshots        AgentRunSheetSnapshot[]
  chartSnapshots   AgentRunChartSnapshot[]
}
```

### 4.3 AgentStep

每个模型步骤完成后由服务端写入一条 `AgentStep`。工具调用和工具结果目前分别保存在 `input`、
`output` JSON 字符串中，而不是拆成独立表。

```prisma
model AgentStep {
  id        Int      @id @default(autoincrement())
  runId     Int
  type      String
  status    String
  content   String?
  toolName  String?
  input     String?
  output    String?
  order     Int
  createdAt DateTime @default(now())
}
```

### 4.4 不存在的 ChatMessage 模型

当前没有独立 `ChatMessage` 表。前端的 AI SDK UI messages 由 `Session.chatMessages` 持久化，
`AgentRun` 则负责运行审计和工具撤销。只有在需要按 message/part 查询、事件回放或精细审计时，
才重新评估是否引入独立消息模型；不要仅按旧方案新增一张重复存储表。

---

## 5. 推荐消息标准

建议把消息定义成多 part 结构，而不是单一 content 字符串。

```ts
type MessageRole = "user" | "assistant" | "system" | "tool";

type MessagePart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool-call"; toolName: string; input: any; callId: string }
  | { type: "tool-result"; toolName: string; output: any; callId: string }
  | { type: "error"; text: string };

interface ChatMessage {
  id: string;
  role: MessageRole;
  parts: MessagePart[];
  createdAt: string;
  runId?: string;
}
```

---

## 6. 前端展示标准

前端消息列表应按 `message + parts` 渲染，而不是仅按 `content` 渲染。

### 6.1 user

- 显示普通文本。

### 6.2 assistant text

- 显示最终回答正文。

### 6.3 reasoning

- 默认对所有用户可展开查看。
- 前端建议采用折叠面板或“展开/收起”样式。
- 既保证信息完整可见，也避免占用过多空间。

### 6.4 tool_call

- 展示为工具卡片。
- 显示工具名称、输入参数、调用状态。

### 6.5 tool_result

- 展示为结果卡片。
- 支持折叠、复制和调试查看。

---

## 7. 标准 Agent 执行流程

### Step 1：用户输入

前端生成一条 `user message`。

### Step 2：创建 Run

后端创建 `AgentRun`，状态设为 `running`。

### Step 3：写入步骤事件

如果模型产生 reasoning：

- 写入 `thinking step`。

如果模型触发工具调用：

- 写入 `tool_call step`。
- 执行工具后写入 `tool_result step`。

### Step 4：生成最终输出

- 写入 `final step`。
- 更新 `AgentRun.outputText`。

### Step 5：完成 Run

- 状态设为 `completed`。
- 填写 `endedAt`。

---

## 8. 事件驱动式架构建议

建议使用事件流来统一前后端。

### 8.1 事件类型

```ts
type AgentEvent =
  | { type: "run.started"; runId: string }
  | { type: "message.created"; message: ChatMessage }
  | { type: "step.started"; step: AgentStep }
  | { type: "step.updated"; step: AgentStep }
  | { type: "step.completed"; step: AgentStep }
  | { type: "run.completed"; runId: string }
  | { type: "run.failed"; runId: string; error: string }
  | { type: "run.aborted"; runId: string };
```

### 8.2 事件流收益

- 前端实时更新。
- 后端好排查。
- 支持回放。
- 支持断点恢复。
- 同时适配流式输出和 tool call。

---

## 9. 当前 API 与后续 API 规划

当前 API 以 workspace 和 session 公共 ID 为资源边界，运行记录不会通过全局 `runId` 暴露。

### 9.1 当前聊天入口

```http
POST /api/workspaces/:workspacePublicId/sessions/draft/chat
POST /api/workspaces/:workspacePublicId/sessions/:sessionPublicId/chat
```

请求体是 AI SDK UI messages；服务端在聊天流开始时创建 `AgentRun`，在流结束时写入最终状态。
草稿入口使用 `Idempotency-Key` 防止重复创建会话。

### 9.2 当前运行查询和撤销

```http
GET  /api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs
POST /api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs/undo-latest
```

运行查询返回 session 下的 runs 及其 steps。撤销只处理当前 session 的单个 undo checkpoint，
并同时恢复 Sheet snapshot、删除结构性创建结果和修剪对应 transcript。

### 9.3 当前中断方式

前端停止聊天或连接断开时，服务端通过请求生命周期的 `AbortController` 取消 Agent stream，
并将运行记录标记为 `aborted`。当前没有独立的 `POST /runs/:id/abort` 接口。

### 9.4 后续可选 API

如果未来需要跨请求的运行监控或事件回放，再在 workspace/session 资源边界下增加运行详情、步骤
分页和事件流接口。新增接口必须复用现有资源授权，不得引入全局 run ID 查询或绕过 session 归属校验。

---

## 10. 当前后端执行边界

当前没有单独命名为 `AgentExecutor` 的服务；`packages/agent/src/runtime/streamChat.ts` 负责
模型流式执行和上下文窗口，`packages/server/src/modules/sessions/chat/streamChat.ts` 负责
workspace/session 资源校验、运行创建、工具组装、step 持久化、transcript 持久化、标题调度和
运行收尾。

后续如需拆分执行器，应保持以下职责边界：

- `packages/agent`：模型调用、上下文裁剪、工具协议和工具结果预算；
- `packages/server`：资源授权、数据库运行生命周期、快照和会话 transcript；
- `packages/web`：AI SDK stream 消费、消息 part 展示、停止操作和工作簿刷新。

不要把数据库写入、workspace 授权或 UI 状态移入 `packages/agent`。

---

## 11. 工具系统标准化

工具需要统一成标准接口。

```ts
interface AgentTool {
  name: string;
  description: string;
  inputSchema: any;
  execute(input: any, context: ToolContext): Promise<any>;
}
```

### 工具调用生命周期

1. 模型发起 tool call。
2. 后端验证参数。
3. 写入 `tool_call step`。
4. 执行工具。
5. 写入 `tool_result step`。
6. 把结果回填给模型。
7. 继续下一轮。

---

## 12. 思考展示建议

建议将思考展示分成两种模式：

### 12.1 默认展开模式

- 思考内容默认对所有用户可展开查看。
- 不需要隐藏为内部调试功能。
- 前端可以采用折叠面板或“展开/收起”样式，保证信息完整可见，同时不占用过多空间。

### 12.2 产品展示建议

- 默认保留思考内容入口。
- 可在样式上弱化视觉权重，避免抢占主回答区域。
- 工具调用与工具结果建议明确区分，方便用户理解执行过程。

---

## 13. 数据库落库原则

当前每次 Agent Run 的持久化边界是：

- `AgentRun`
- `AgentStep[]`
- `Session.chatMessages` 中的用户和 assistant transcript
- 工作簿修改对应的 `AgentRunSheetSnapshot` 或 `AgentRunChartSnapshot`
- `status`
- `timestamps`
- `errorMessage` 或 `aborted` 状态

当前没有独立的 `UserMessage`、`AssistantFinalMessage` 或 `ChatMessage` 表。只有在需要按
message/part 查询、事件回放或精细审计时，才重新评估是否引入独立消息模型。

---

## 14. 当前项目的改造阶段

### Phase 1：统一数据模型（已完成基础版本）

目标：

- `AgentRun`、`AgentStep`、`AgentRunSheetSnapshot` 和 `AgentRunChartSnapshot` 已存在。
- `Session.chatMessages` 保留 AI SDK transcript。
- 运行状态、步骤和撤销状态已有服务端持久化路径。

改动范围：

- 后续只补充类型约束、分页和审计能力，不重复创建已有模型。

### Phase 2：前端消息 part 与运行状态（部分完成）

目标：

- 消息列表已经支持 reasoning、tool part 和步骤分隔展示。
- 工作簿工具调用完成后会触发工作区刷新。
- 运行列表 API 已可读取持久化 steps，但前端尚未完整展示独立的 run/step 时间线。

剩余工作主要是让前端展示持久化的 run/step 时间线，并为跨包状态增加更严格的类型边界。

### Phase 3：abort / stop（已完成请求级中断）

目标：

- 前端 `useChat().stop()` 会中断当前 stream。
- 服务端使用请求连接生命周期的 `AbortController` 取消执行。
- `AgentRun` 会记录 `aborted` 状态。

请求级中断已经是当前实现，不再作为待实施改造项。

### Phase 4：完善 tool calling 与事件回放（基础能力已完成，增强项待规划）

目标：

- 模型已经可以调用 workbook/sheet 工具，工具结果会回填模型并持久化到 step。
- `packages/agent` 已提供工具 catalog、运行上下文和结果预算。
- 尚未实现独立事件总线、断线重连后的运行事件回放和强类型 step 状态协议。

后续是否引入独立事件总线，应由断线恢复、监控或审计需求驱动；不为抽象本身新增
`AgentExecutor` 或 event bus。

---

## 15. 当前 MVP 基线

当前 MVP 已包含：

### 数据

- `Session.chatMessages` transcript
- `AgentRun`
- `AgentStep`
- `AgentRunSheetSnapshot`
- `AgentRunChartSnapshot`

### 消息类型

- `user`
- `assistant`
- `reasoning`
- `tool_call`
- `tool_result`

### 前端

- 消息按 part 渲染。
- reasoning 折叠。
- tool 卡片展示。
- stop 按钮和请求级 abort。
- workbook mutation 后的 workspace refresh。

### 后端

- run 创建和幂等处理。
- step 落库。
- AI SDK 流式输出。
- abort、错误收尾和 transcript 持久化。
- 单个 session undo checkpoint。

---

## 16. 后续实施建议

建议继续增量演进：

1. 先为 `AgentRun.status`、`AgentStep.type` 和 `AgentStep.status` 建立共享的受限类型与边界校验。
2. 再决定是否需要独立的运行事件流；没有断线恢复、监控或审计需求时，不新增事件总线。
3. 如引入事件流，复用现有 workspace/session 授权和运行持久化，不改变 transcript 的唯一用户历史来源。
4. 运行详情、step 分页和回放能力稳定后，再评估是否拆分 server 的 chat orchestration 文件。

这样风险最小，也更容易验证。
