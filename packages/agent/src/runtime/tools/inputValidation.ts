import type { z } from "zod";
import { ToolInputValidationError } from "./errors.js";

export interface ValidationResult<T = unknown> {
  success: boolean;
  data: T;
  error?: ToolInputValidationError;
}

export function validateToolInput<T>(
  schema: z.ZodType<T>,
  input: unknown,
  toolName: string,
): ValidationResult<T> {
  if (!schema || typeof schema.safeParse !== "function") {
    return { success: true, data: input as T };
  }

  const result = schema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errorMessages = result.error.issues.map((issue) => {
    const path = issue.path.map((p) => String(p)).join(".");
    return `${path ? `${path}: ` : ""}${issue.message}`;
  });

  return {
    success: false,
    data: input as T,
    error: new ToolInputValidationError(
      `${toolName}: 输入参数验证失败: ${errorMessages.join("; ")}`,
      {
        toolName,
        issues: result.error.issues,
      },
    ),
  };
}

export function validateAndTransform<T>(schema: z.ZodType<T>, input: unknown, toolName: string): T {
  const result = validateToolInput(schema, input, toolName);
  if (!result.success && result.error) {
    throw result.error;
  }
  return result.data;
}
