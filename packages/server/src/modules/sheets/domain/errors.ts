export class SheetNotFoundError extends Error {
  constructor(sheetId: number) {
    super(`Sheet ${sheetId} 不存在`);
    this.name = "SheetNotFoundError";
  }
}

export class SheetRevisionConflictError extends Error {
  readonly sheetId: number;

  constructor(sheetId: number) {
    super(`Sheet ${sheetId} 已被其他操作修改`);
    this.name = "SheetRevisionConflictError";
    this.sheetId = sheetId;
  }
}

export class SheetMutationIdConflictError extends Error {
  readonly mutationId: string;

  constructor(mutationId: string) {
    super(`Mutation ${mutationId} 已用于其他命令`);
    this.name = "SheetMutationIdConflictError";
    this.mutationId = mutationId;
  }
}
