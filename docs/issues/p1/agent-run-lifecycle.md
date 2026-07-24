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

## 长期方案

本 issue 的长期目标不是把所有运行逻辑迁移到 `packages/agent`，而是保持 Agent 内核与 server 运行控制解耦，同时收口 server 内部的状态转换、持久化和恢复边界。

### 1. Agent 运行控制

`packages/agent` 继续只负责模型循环、工具循环、停止条件、重试、事件生成和 completion。租约、权限、数据库、SSE、transcript 和恢复均由 `packages/server` 负责。

server 的运行控制建议逐步收口为以下职责：

```text
sessions/runs/
  runCoordinator.ts       # 启动、取消和恢复运行
  runFinalizer.ts         # 唯一的终态收口
  runRecoveryWorker.ts    # 扫描过期租约并处理 stale run
  runEventRepository.ts   # 事件幂等写入和回放
  runDiagnostics.ts       # recovery_required 查询和人工处理
```

所有 run 状态写入都必须带 `runId`、`ownerId` 和 `sessionVersion` 条件。finalizer 可以被多次触发，但只有第一次有效触发可以改变终态；重复触发必须返回已确认的结果，不能重复写 transcript、Undo checkpoint 或释放其他 run 的 lease。

客户端断流只影响 SSE 传输，不影响 server-owned Agent run。进程退出后，recovery worker 扫描租约已过期且仍为 `running` 的 run：能够安全续跑的进入恢复流程，无法判断副作用是否已完成的进入 `recovery_required`，并保留诊断信息。该状态需要提供“重试恢复”和“放弃运行”两个明确的管理入口。

### 2. 事件持久化

事件表对 `(runId, sequence)` 和 `(runId, eventId)` 建立唯一约束。事件写入采用幂等语义：相同事件重复写入返回已存在记录；相同 sequence 对应不同 eventId 时判定为协议冲突并停止运行。

事件持久化成功后才能向外发布或交给 UI stream。回放只消费已确认的事件，并按 sequence 排序和去重；回放不能重新执行工具副作用。

### 3. Sheet 和 Chart mutation 事务

Sheet 和 Chart 保持各自的领域服务，不合并成一个业务模块；但两者共享统一的 mutation 基础设施：

```text
workbooks/mutations/
  mutationReceipt.ts
  mutationLock.ts
  snapshotBudget.ts
```

一次 mutation 的数据库事务必须同时包含：

1. 校验 workspace、workbook、sheet 或 chart 的归属；
2. 检查 mutation receipt；
3. 读取旧状态并写入 Undo snapshot；
4. 执行 Sheet 或 Chart 实际变更；
5. 写入 mutation receipt；
6. 失效受影响的旧 Undo checkpoint。

图表创建、更新和删除尤其不能再采用“先单独写 Undo 快照，再单独写图表”的跨事务流程。`ChartMutationService` 应通过 transaction client 调用 chart repository 和 snapshot repository，使快照、图表变更和 receipt 同时提交或同时回滚。

### 4. 多实例协调

`withWorkspaceUndoLock` 当前只能保护同一进程。多实例部署前必须替换为以 `workbookId` 为粒度的数据库协调：PostgreSQL 使用 advisory lock 或行锁，MySQL 使用事务行锁或等价机制。只有在数据库锁无法满足部署要求时才引入 Redis，并且必须具备 TTL、owner token 和续租机制。

锁只保护同一工作簿的 mutation 和 Undo checkpoint，不锁整个 workspace，也不下沉到 `packages/agent`。

### 5. Receipt 和快照预算

Sheet 和 Chart 统一使用包含以下字段的 mutation receipt：

```text
mutationId, workbookId, entityType, entityId,
commandHash, result, createdAt, expiresAt
```

相同 mutationId 和 commandHash 返回原结果；相同 mutationId 但 commandHash 不同则拒绝。receipt 需要唯一索引、保留窗口和定期清理任务；receipt 的清理不能提前删除仍用于 Undo 的快照。

Undo snapshot 增加统一预算：celldata 数量、JSON 字节数、合并区域数量和单次 mutation 影响的 Sheet 数量。超过预算时整个 mutation 失败，不写入不完整快照，并返回可诊断错误。

### 6. 实施顺序

1. 将 Chart mutation 的旧状态、Undo snapshot、实际写入和 receipt 收口到同一个事务。
2. 抽取通用 mutation receipt 和 snapshot budget，并补充过期清理。
3. 将进程内 workspace 锁替换为数据库 workbook 锁。
4. 实现 stale run recovery worker。
5. 增加 `recovery_required` 的诊断、重试恢复和放弃运行入口。
6. 补充多实例并发、进程中断、重复请求、事件重放和事务回滚集成测试。

完成上述步骤并通过验收后，才关闭本 P1 issue。目录拆分本身不作为验收条件；验收重点是事务原子性、状态幂等、租约安全和异常可恢复。

## 非目标

- 本 issue 不实现 compaction；该能力仍按现有 P2 计划禁用；
- 本 issue 不移动 Excel/Chart 具体工具到 `packages/agent`；
- 本 issue 不改变前端 UI message stream 格式。
