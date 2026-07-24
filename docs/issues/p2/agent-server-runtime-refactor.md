# Agent/Server Runtime API 重构

- **优先级**：P2
- **创建日期**：2026-07-24
- **状态**：Open
- **前置条件**：[Agent Run 生命周期与事件可靠性](../p1/agent-run-lifecycle.md) 的 completion 和事件边界稳定
- **范围**：AgentRunner API、server chat orchestration、runtime 模块边界和工具适配层

## 问题

当前 `AgentRunner` 已经是 Agent runtime 的 facade，但 server 仍需传入较多生命周期回调和执行策略，`streamChat` 同时承担 lease、工具组装、上下文读取、引用解析、持久化 wiring 和 Agent 启动。

这主要是可维护性和扩展性问题：当加入模型选择、远程 Agent、重试策略或多 sink 时，server orchestration 会继续膨胀。它不等同于 P1 的 run 数据一致性问题。

## 目标

- 用 `executeTurn` 表达一个独立的 Agent turn 执行单元；
- Agent 负责模型步骤、上下文策略、重试、停止条件、工具协议适配和 provider-neutral 事件；
- server 负责组装授权输入、具体工具能力、lease、幂等、事务、持久化和 HTTP transport；
- 移除 server 对 Agent 内部回调顺序的依赖；
- 每个迁移阶段保持类型检查和测试通过。

## 稳定边界

### `packages/agent`

- `executeTurn(input)` 是 Agent turn 的公开入口；
- `runtime/loop` 负责模型/工具循环；
- `runtime/tools` 负责把 `AgentToolDefinition` 和注入的 `ToolExecutor` 适配成 provider tool set；
- `runtime/events` 负责事件 schema、序列和发射；
- `runtime/stream` 只负责 UI stream 传输适配；
- Agent 不读取数据库，不依赖 HTTP/Fastify/Prisma，不执行具体 Excel/Chart 副作用。

### `packages/server`

- 读取 canonical transcript 并解析 workspace references；
- 构建 server-owned 的 Excel/Chart tool registry 和授权 execution context；
- 组合工具幂等、数据库事务、undo 和 mutation receipt；
- 管理 session lease、取消、事件持久化、run finalizer 和 HTTP stream；
- 将 Agent runtime policy 作为 typed input 传入，不在 server 复制模型 loop、上下文裁剪或停止条件。

## 目标 API

```typescript
export interface TurnExecutorInput {
  modelConfig: ModelConfig;
  transcript: AgentTranscriptMessage[];
  workspace: WorkspaceWorkbookSummary[];
  tools: readonly AgentToolDefinition[];
  toolExecutor: ToolExecutor;
  runtimePolicy?: AgentRuntimePolicy;
  executionContext?: unknown;
  abortSignal?: AbortSignal;
  eventSink?: AgentEventSink;
  persistenceBarrier?: PersistenceBarrier;
}

export interface TurnExecutorResult {
  stream: ReadableStream<unknown>;
  completion: Promise<AgentRunCompletion>;
}

export function executeTurn(input: TurnExecutorInput): Promise<TurnExecutorResult>;
```

`ModelConfig` 和受部署配置约束的 runtime policy 仍可由 server 提供；默认值、策略解释和执行过程由 agent 负责。`AgentRunCompletion` 必须提供 canonical transcript 增量、终态和错误分类，具体生命周期要求见 P1 issue。

工具侧只下沉通用适配能力，不下沉具体执行器：

- 可以在 agent 中提供 `createToolExecutorAdapter` 等无业务依赖的通用 helper；
- Excel/Chart 工具定义、授权、幂等和副作用仍由 server 组装；
- 不在 agent 中创建名为 `createConcreteToolExecutor` 的 server 业务抽象。

## 验收条件

- `packages/agent` 不依赖 server、HTTP、Fastify、Prisma 或具体 workbook storage；
- `streamChat` 只负责加载上下文、获取 lease、组装 server ports、调用 `executeTurn` 和交给 finalizer；
- server 不包含 Agent loop、上下文裁剪、重试或停止条件的重复实现；
- `executeTurn` 的公开 contract 不暴露 AI SDK `ToolSet`；
- Agent、server 和端到端测试通过，覆盖取消、超时、工具失败、持久化失败和断流；
- 每个迁移提交都通过 `pnpm typecheck` 及受影响包测试；
- 前端 UI message stream 格式和已有 chat API 行为保持不变。

## 分阶段实施

### 阶段 1：先抽象 contract，不删除旧入口

- 新增 `TurnExecutorInput`、`TurnExecutorResult` 和 `AgentRuntimePolicy`；
- 将 `AgentRunner` 的组装逻辑提取到 `executeTurn` 内部；
- 增加 contract、completion 和 server 调用方测试；
- 保持旧入口仅作为同一变更集内的内部迁移桥接，不对外继续导出。

### 阶段 2：迁移 server 调用方

- 将 `streamChat` 切换到 `executeTurn`；
- 由 server 注入 tool registry、idempotent executor、event sink、persistence barrier 和 cancellation；
- 将生命周期收尾交给 P1 的 server finalizer；
- 保持 `pnpm typecheck` 和受影响测试通过。

### 阶段 3：移除旧 API 并收紧模块边界

- 删除 `AgentRunner`、旧回调字段和未使用的导出；
- 将通用工具适配 helper 放入 `runtime/tools`；
- 将 turn facade、loop、events、stream 和 tools 的职责写入 `docs/agent-loop.md`；
- 确认 agent 包不出现 server 业务依赖。

### 阶段 4：验证扩展点

- 为多模型 purpose、替换 event sink、mock model 和远程 tool executor 增加 contract tests；
- 检查新增能力不需要重新修改 `streamChat` 的生命周期逻辑；
- 完成架构文档和测试矩阵后关闭 issue。

## 非目标

- 不在本 issue 实现 compaction；
- 不改变 Excel/Chart 工具的业务行为；
- 不为了减少文件行数而移动 server 的授权、事务、幂等或 undo 逻辑。
