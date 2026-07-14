export class WorkspaceNotFoundError extends Error {
  statusCode: number;

  constructor(message = "Workspace not found", statusCode = 404) {
    super(message);
    this.name = "WorkspaceNotFoundError";
    this.statusCode = statusCode;
  }
}
