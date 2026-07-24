import type { z } from "zod";
import { estimateTokens } from "../../session/contextWindow.js";
import { ToolExecutionError } from "./errors.js";

export interface SerializationOptions {
  maxTokens?: number;
  truncate?: boolean;
}

export interface SerializationResult<T = unknown> {
  success: boolean;
  data: T;
  truncated?: boolean;
  error?: ToolExecutionError;
}

export function serializeToolOutput<T>(
  schema: z.ZodType<T>,
  output: unknown,
  toolName: string,
  options: SerializationOptions = {},
): SerializationResult<T> {
  const result = schema.safeParse(output);

  if (!result.success) {
    const errorMessages = result.error.issues.map((issue) => {
      const path = issue.path.map((p) => String(p)).join(".");
      return `${path ? `${path}: ` : ""}${issue.message}`;
    });

    return {
      success: false,
      data: output as T,
      error: new ToolExecutionError(`${toolName}: 输出序列化失败: ${errorMessages.join("; ")}`, {
        toolName,
        issues: result.error.issues,
      }),
    };
  }

  const maxTokens = options.maxTokens ?? 64_000;
  const tokenCount = estimateTokens(result.data);

  if (tokenCount > maxTokens && options.truncate !== false) {
    return {
      success: true,
      data: truncateOutput(result.data, maxTokens) as T,
      truncated: true,
    };
  }

  return { success: true, data: result.data };
}

function truncateOutput(value: unknown, maxTokens: number): unknown {
  if (typeof value === "string") {
    const text = value;
    let end = Math.max(1, Math.floor(text.length * 0.75));
    let result = `${text.slice(0, end)}\n[工具输出已按上下文预算截断]`;
    while (estimateTokens(result) > maxTokens && end > 1) {
      end = Math.max(1, Math.floor(end * 0.75));
      result = `${text.slice(0, end)}\n[工具输出已按上下文预算截断]`;
    }
    return estimateTokens(result) <= maxTokens ? result : "[工具输出已截断]";
  }

  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    const truncated: Record<string, unknown> = {};
    let remainingTokens = maxTokens;

    for (const key of keys) {
      const val = obj[key];
      const valTokens = estimateTokens(val);

      if (valTokens <= remainingTokens) {
        truncated[key] = val;
        remainingTokens -= valTokens;
      } else {
        truncated[key] = truncateOutput(val, remainingTokens);
        remainingTokens = 0;
      }

      if (remainingTokens <= 0) break;
    }

    truncated["__truncated__"] = true;
    return truncated;
  }

  return value;
}

export function serializeAndValidate<T>(
  schema: z.ZodType<T>,
  output: unknown,
  toolName: string,
  options?: SerializationOptions,
): T {
  const result = serializeToolOutput(schema, output, toolName, options);
  if (!result.success && result.error) {
    throw result.error;
  }
  return result.data;
}
