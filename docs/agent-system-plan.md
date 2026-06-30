# 标准化 Agent 系统实施方案

本文档用于规划当前项目的对话能力升级方案。目标是把现有“只存最终文本”的聊天模式，演进为一套可追踪、可中断、可展示步骤、可落库、可回放的 Agent 系统。

## 1. 现状问题

结合当前代码实现，主要有以下几个问题：

1. **消息模型过于简单**
   - 目前数据库中仅有 `user / assistant` 文本消息。
   - 没有拆分为 `thinking / tool_call / tool_result / final` 等标准步骤。

2. **前后端协议不统一**
   - 前端使用 `useChat()` 传递 `messages[]`。
   - 后端又从历史消息重新拼上下文。
   - 缺少统一的运行状态协议，无法完整表达一次 Agent 执行过程。

3. **数据库落库不适合 Agent**
   - 当前 `Message` 更接近“纯聊天记录”。
   - Agent 需要记录的是：一次运行、多个步骤、工具调用链、最终输出、错误与中断状态。

4. **界面不支持展示思考与工具链**
   - 当前前端只展示文本消息。
   - 没有思考过程展示。
   - 没有 tool call / tool result 卡片。

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

## 4. 推荐的数据模型

### 4.1 Session

保留现有 Session 概念。

```prisma
model Session {
  id        Int      @id @default(autoincrement())
  sheetId   Int
  name      String
  sheet     Sheet    @relation(fields: [sheetId], references: [id], onDelete: Cascade)
  runs      AgentRun[]
  createdAt DateTime @default(now())
}
```

### 4.2 AgentRun

一次 Agent 调用的主记录。

```prisma
model AgentRun {
  id            Int      @id @default(autoincrement())
  sessionId     Int
  userMessageId Int?
  status        String   // pending | running | completed | failed | aborted
  model         String?
  systemPrompt  String?
  inputText     String?
  outputText    String?
  errorMessage  String?
  startedAt     DateTime @default(now())
  endedAt       DateTime?
  session       Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  steps         AgentStep[]
}
```

### 4.3 AgentStep

记录每一个可观察步骤。

```prisma
model AgentStep {
  id          Int      @id @default(autoincrement())
  runId       Int
  type        String   // thinking | tool_call | tool_result | final | error
  status      String   // started | streaming | completed | failed
  toolName    String?
  input       String?
  output      String?
  content     String?
  order       Int
  createdAt   DateTime @default(now())
  run         AgentRun @relation(fields: [runId], references: [id], onDelete: Cascade)
}
```

### 4.4 ChatMessage

如需保留统一聊天视角，可增加一层消息表。

```prisma
model ChatMessage {
  id          Int      @id @default(autoincrement())
  sessionId   Int
  runId       Int?
  role        String   // user | assistant | system | tool
  partType    String?  // text | reasoning | tool-call | tool-result
  content     String
  metadata    String?
  createdAt   DateTime @default(now())
}
```

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

## 9. 推荐 API 设计

### 9.1 创建 Run

```http
POST /api/sessions/:sessionId/runs
```

请求：

```json
{
  "input": "帮我分析这张表"
}
```

响应：

```json
{
  "runId": 123,
  "status": "running"
}
```

### 9.2 获取 Run 详情

```http
GET /api/runs/:runId
```

### 9.3 获取 Run Steps

```http
GET /api/runs/:runId/steps
```

### 9.4 事件流

```http
GET /api/runs/:runId/events
```

可用 SSE 或 WebSocket 实现。

### 9.5 中断 Run

```http
POST /api/runs/:runId/abort
```

---

## 10. 后端执行引擎建议

当前实现更接近“流式聊天”，不是完整 agent。

建议新增一个 `AgentExecutor`，负责：

- 读取上下文。
- 调用模型。
- 解析 tool call。
- 执行工具。
- 记录 step。
- 输出事件。
- 支持 abort。

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

每次 Agent Run 至少需要记录：

- `AgentRun`
- `UserMessage`
- `AgentStep[]`
- `AssistantFinalMessage` 或 final step
- `status`
- `timestamps`
- `error` 或 `abort reason`

当前 `Message` 表如果继续保留，建议作为兼容层，而不是唯一来源。

---

## 14. 当前项目的推荐改造阶段

### Phase 1：统一数据模型

目标：

- 引入 `AgentRun`。
- 引入 `AgentStep`。
- 保留 `Message` 作为兼容层或迁移层。

改动范围：

- Prisma schema。
- repository。
- service。
- API 返回结构。

### Phase 2：前端改成事件渲染

目标：

- 消息列表支持渲染 step。
- 支持 tool 卡片。
- 支持思考展示。

改动范围：

- `ChatInterface.tsx`。
- 消息渲染组件拆分。
- 增加 step renderer。

### Phase 3：加入 abort / stop

目标：

- 前端提供停止按钮。
- 后端取消执行。
- 数据库记录 aborted。

改动范围：

- `useChat` 或自定义 transport。
- `AbortController`。
- `streamText({ abortSignal })`。

### Phase 4：加入真正的 tool calling

目标：

- 模型可调用工具。
- 工具结果可回填。
- 支持多步 agent loop。

改动范围：

- `AgentExecutor`。
- Tool registry。
- event bus。
- step persistence。

---

## 15. MVP 建议

如果先做最小可行版本，建议至少包含：

### 数据

- `Message`
- `AgentRun`
- `AgentStep`

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
- stop 按钮。

### 后端

- run 创建。
- step 落库。
- 流式事件输出。
- abort 支持。

---

## 16. 实施建议

建议不要一次性推翻现有实现，而是逐步迁移：

1. 保留现有 `Message` 表。
2. 新增 `AgentRun` / `AgentStep`。
3. 先把思考、工具调用、工具结果作为 step 记录。
4. 前端先支持展示 step。
5. 再把聊天接口逐步迁移成 event-driven agent 接口。

这样风险最小，也更容易验证。
