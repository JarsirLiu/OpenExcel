# Sheet Sync 后续治理

- **优先级**：P1
- **状态**：非阻断，按部署规模和数据量处理
- **范围**：图表写入、Undo checkpoint、mutation 事务、跨实例锁和 mutation receipt

图表写入、Undo checkpoint 和实际 mutation 仍需收口到同一个事务应用服务，避免异常时状态需要人工排查。`withWorkspaceUndoLock` 当前是进程内锁；多实例部署前应替换为数据库锁或分布式锁。mutation receipt 需要保留窗口和清理任务；手动快照写入需要增加 celldata、配置和合并数量预算。

这些问题当前不会阻止单实例下的正常编辑、AI 修改或撤销，也不会改变已有的 revision 冲突保护，但会增加多实例部署和异常恢复的运维风险。

## 验收条件

- 图表 mutation、工作簿版本、Undo checkpoint 和工具幂等账本在同一事务边界内提交或回滚；
- 多实例同时写入同一工作簿时使用数据库锁或等价的分布式协调机制；
- mutation receipt 有明确的保留窗口、清理任务和重复调用测试；
- 手动快照对 celldata、配置和合并区域设置预算，超限时显式失败而不是生成不完整快照。
