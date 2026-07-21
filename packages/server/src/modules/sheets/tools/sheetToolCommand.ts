export function createSheetToolMutationId(
  runId: number,
  toolName: string,
  toolCallId: string | undefined,
): string {
  if (!toolCallId) {
    throw new Error(`${toolName} 缺少 toolCallId，无法保证幂等执行`);
  }
  return `ai:${runId}:${toolCallId}`;
}
