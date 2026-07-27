# P2：Agent 上下文压缩与窗口策略

- **优先级**：P2
- **状态**：设计完成，尚未实现
- **范围**：Agent model context、token 预算、自动压缩、窗口滑动、checkpoint 和恢复
- **设计文档**：[Agent 上下文策略：自动压缩与窗口滑动](../../context-compaction.md)
- **包设计**：[Agent 可复用包设计](../../agent-core-package.md)

## 背景

当前 Agent 只有基于 token 预算的窗口裁剪，自动压缩能力尚未接入。旧的按消息数量压缩
实现不是可用功能，不应作为兼容路径保留。

## 目标

- 默认使用当前对话模型自动生成上下文 checkpoint；
- 支持配置为 `sliding-window`，在自动压缩异常时作为快速应急模式；
- 两种模式不改变 canonical transcript、AgentEvent 或前端 NDJSON 协议；
- 工具调用、工具结果、checkpoint 和 workspace revision 保持一致；
- provider 返回的真实 input usage 优先，缺少 usage 时使用增量估算预测下一次请求；
- 压缩失败返回真实后端错误，不伪造摘要或静默切换。

## 非目标

- 不删除服务端完整历史；
- 不让前端参与上下文组装；
- 不引入独立的压缩模型配置；
- 不使用 AI SDK UI message stream 作为新的前端协议；
- 不把摘要当作工作簿数据库事实源。

## 关闭验收

- `compaction` 和 `sliding-window` 都按 token 预算选择上下文；
- 单轮超预算、巨大工具结果和孤立 tool call 都有明确处理；
- context checkpoint 有独立持久化、版本保护和 workspace revision 失效机制；
- 自动压缩模型调用复用当前 chat model；
- 真实 usage 到达后会修正估算基线，压缩后不会使用 stale usage 再次触发压缩；
- 压缩失败、持久化失败和上下文仍超限具有不同诊断阶段；
- 压缩前后历史接口、实时事件投影和恢复结果一致；
- 窗口滑动配置可以在不改代码的情况下启用并绕过压缩模型。
