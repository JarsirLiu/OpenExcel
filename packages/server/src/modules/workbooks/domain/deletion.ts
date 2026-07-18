export class SheetDeletionBlockedError extends Error {
  readonly chartIds: readonly string[];

  constructor(chartIds: readonly string[]) {
    super(`无法删除 Sheet：仍有 ${chartIds.length} 个图表引用它`);
    this.name = "SheetDeletionBlockedError";
    this.chartIds = chartIds;
  }
}
