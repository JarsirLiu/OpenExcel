export type ToolErrorKind =
  | "validation_failed"
  | "execution_failed"
  | "not_found"
  | "permission_denied"
  | "rate_limit"
  | "timeout";

export interface ToolError {
  kind: ToolErrorKind;
  message: string;
  details?: Record<string, unknown>;
  retryable?: boolean;
}

export class ToolInputValidationError extends Error implements ToolError {
  readonly kind: ToolErrorKind = "validation_failed";
  constructor(
    public readonly message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ToolInputValidationError";
  }
}

export class ToolExecutionError extends Error implements ToolError {
  readonly kind: ToolErrorKind = "execution_failed";
  constructor(
    public readonly message: string,
    public readonly details?: Record<string, unknown>,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "ToolExecutionError";
  }
}

export class ToolNotFoundError extends Error implements ToolError {
  readonly kind: ToolErrorKind = "not_found";
  constructor(public readonly message: string) {
    super(message);
    this.name = "ToolNotFoundError";
  }
}

export class ToolPermissionError extends Error implements ToolError {
  readonly kind: ToolErrorKind = "permission_denied";
  constructor(public readonly message: string) {
    super(message);
    this.name = "ToolPermissionError";
  }
}

export class ToolRateLimitError extends Error implements ToolError {
  readonly kind: ToolErrorKind = "rate_limit";
  public readonly retryable: boolean = true;
  constructor(public readonly message: string) {
    super(message);
    this.name = "ToolRateLimitError";
  }
}

export class ToolTimeoutError extends Error implements ToolError {
  readonly kind: ToolErrorKind = "timeout";
  public readonly retryable: boolean = true;
  constructor(public readonly message: string) {
    super(message);
    this.name = "ToolTimeoutError";
  }
}

export function isToolError(error: unknown): error is ToolError {
  return error instanceof Error && "kind" in error;
}

export function toToolError(error: unknown): ToolError {
  if (isToolError(error)) {
    return error;
  }
  if (error instanceof Error) {
    return new ToolExecutionError(error.message);
  }
  return new ToolExecutionError(String(error));
}
