# Agent Run 生命周期与事件可靠性

- **优先级**：P1
- **创建日期**：2026-07-24
- **状态**：Open
- **范围**：Agent completion、HTTP stream、run 终态、session lease、transcript、事件持久化和恢复

## 问题

当前 Agent 的运行完成、UI stream 结束和 server run finalize 通过回调链连接：

1. `packages/agent/src/runtime/loop/agentLoop.ts` 通过 `uiStreamAdapter` 的 `onEnd` 推动 completion；Agent 执行完成不应依赖客户端是否继续消费 HTTP stream。
2. `packages/server/src/modules/sessions/chat/orchestration.ts` 在多个回调中分别记录终态、持久化 transcript、更新 undo checkpoint 和释放 lease，失败路径难以证明完整。
3. 事件协议只有部分生命周期事件，`step.started`、工具请求和工具结果的语义、payload、顺序和回放规则没有统一定义。
4. 客户端断流、lease 丢失、事件持久化失败和 transcript 持久化失败时，需要明确区分“运行已完成”和“等待恢复”。

这些问题会造成 run 状态、session transcript、事件游标和 lease 不一致，属于可靠性风险，不是单纯的目录重构问题。

## 目标

建立与 HTTP transport 解耦的 Agent run 生命周期：

- Agent completion 独立于 UI stream 的消费和断开；
- server 使用一个可重入的 finalizer，按固定顺序完成 transcript、run 终态和 lease 清理；
- 事件协议由 Agent 统一生成，server 只负责持久化、发布和回放；
- 持久化失败进入可诊断、可恢复状态，不把失败吞成 completed；
- 工具副作用、授权、幂等账本、数据库事务和 undo 仍由 server 负责。

## 职责边界

| 职责 | 归属 | 说明 |
|------|------|------|
| 模型步骤、停止条件、重试和 Agent completion | agent | 不依赖 HTTP 或数据库 |
| provider-neutral 事件生成和顺序 | agent | 只生成协议事件 |
| Excel/Chart 工具授权与具体副作用 | server | 通过 `ToolExecutor` 端口注入 |
| 工具幂等、事务、undo 和 mutation receipt | server | 不能下沉到 agent |
| transcript、run、step 和事件持久化 | server | 以持久化确认作为权威边界 |
| HTTP stream 和断流处理 | server | 不能改变 canonical run 状态 |
| session lease、心跳和恢复 | server | 与 Agent 内核分离 |

## 生命周期契约

`executeTurn` 返回的 `completion` 必须在 Agent 执行终态确定后完成，不能以客户端消费完 UI stream 作为前置条件。server 负责启动一个受控的异步 finalizer：

1. 等待 Agent completion；
2. 合并并持久化 canonical transcript；
3. 在 transcript 成功后写入 run 终态和 output/error；
4. 持久化失败时将 run 标记为 `recovery_required` 或等价的可恢复状态；
5. 无论成功或失败，都在 `finally` 中释放 lease；
6. finalizer 具备幂等保护，重复触发不能重复覆盖 transcript、终态或 undo checkpoint。

UI stream 只负责向客户端传输已确认的事件和展示消息。客户端断开不能取消 server-owned Agent run；显式取消必须通过 server 的 cancel API 和 abort signal 完成。

## 事件协议

事件名称沿用现有协议并补齐缺失生命周期，不同时引入同义事件：

- `run.started`
- `step.started`
- `tool.started`
- `tool.finished`
- `step.finished`
- `run.completed`
- `run.cancelled`
- `run.failed`

每个事件必须包含唯一 `eventId`、单调递增的 run 内 `sequence`、UTC 时间和版本化 payload。Agent 先等待 `PersistenceBarrier` 确认，再交给 server event sink；回放按 `sequence` 去重，不能重复执行工具副作用。

`docs/agent-loop.md` 需要补充每类事件的 payload、终态转换、重复事件处理和断点回放规则。本 issue 不改变前端 UI message stream 的外部格式。

## 验收条件

- 客户端断流后，run 仍能完成、失败或进入 `recovery_required`，不会永久占用 lease；
- transcript 持久化失败不会把 run 标记为 `completed`；
- lease 丢失不会覆盖新 run 的 session 消息或终态；
- event persistence 失败会停止后续 Agent 执行；
- 相同 `(runId, toolCallId)` 重放不会重复执行 Excel/Chart 副作用；
- 事件按 sequence 回放时不会重复落库或重复展示；
- 覆盖取消、超时、工具失败、断流、进程中断和恢复场景的 Agent、server 集成测试通过；
- 前端发送消息到 run 完成的端到端测试通过。

## 分阶段实施

### 阶段 1：先固定协议和失败矩阵

- 在 `docs/agent-loop.md` 固化事件 schema、终态转换和持久化顺序；
- 补充 completion、断流、lease 丢失和持久化失败测试；
- 明确 `recovery_required` 的查询和恢复入口。

### 阶段 2：解耦 Agent completion 与 UI stream

- 让 Agent 内部执行生命周期不依赖 `uiStreamAdapter.onEnd`；
- 让 `completion` 返回 canonical transcript 增量、终态和错误分类；
- 保持 UI stream adapter 只做传输适配。

### 阶段 3：集中 server finalizer

- 新增单一的 run finalizer，统一 transcript、run、undo checkpoint 和 lease 顺序；
- 所有终态路径复用同一个 finalizer，并使用 `try/finally` 清理 lease；
- 持久化失败进入恢复状态并保留诊断信息。

### 阶段 4：事件回放和恢复验证

- 增加事件断点查询、重复事件去重和 run 恢复测试；
- 验证多实例下 lease 接管不会覆盖 canonical transcript；
- 完成端到端测试后再关闭 issue。

## 非目标

- 本 issue 不实现 compaction；该能力仍按现有 P2 计划禁用；
- 本 issue 不移动 Excel/Chart 具体工具到 `packages/agent`；
- 本 issue 不改变前端 UI message stream 格式。
