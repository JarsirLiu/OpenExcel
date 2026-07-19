import { estimateTokens } from "../session/contextWindow.js";

export const DEFAULT_TOOL_RESULT_BUDGET_TOKENS = 32_000;
export const DEFAULT_TOOL_RESULT_MAX_TOKENS = 8_000;
export const DEFAULT_READ_SHEET_DATA_BUDGET_TOKENS = 24_000;

type ToolExecute = (input: unknown, options?: unknown) => unknown;

export type ToolResultPolicy = { kind: "generic" } | { kind: "paged-structured" };

export type ToolExecutionBudget = {
  maxTokens: number;
  policy: ToolResultPolicy["kind"];
};

export type BudgetableTool = Record<string, unknown> & {
  execute?: ToolExecute;
};

export type BudgetableToolSet = Record<string, BudgetableTool>;

export interface ToolResultBudgetOptions {
  totalTokens?: number;
  maxResultTokens?: number;
  toolBudgets?: Record<string, number>;
  toolPolicies?: Record<string, ToolResultPolicy>;
}

export interface ToolResultBudgetSnapshot {
  totalTokens: number;
  usedTokens: number;
  reservedTokens: number;
  remainingTokens: number;
  calls: number;
  toolTokens: Record<string, number>;
}

interface Reservation {
  id: number;
  toolName: string;
  tokenLimit: number;
  policy: ToolResultPolicy["kind"];
}

interface TruncatedToolResult {
  ok: true;
  truncated: true;
  code: "TOOL_RESULT_TRUNCATED" | "TOOL_RESULT_TOO_LARGE";
  tool: string;
  message: string;
  budget: ToolResultBudgetSnapshot;
}

function positiveInt(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : fallback;
}

function stringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}

function truncateString(value: string, maxTokens: number): string {
  if (estimateTokens(value) <= maxTokens) return value;

  let end = Math.max(1, Math.floor(value.length * 0.75));
  let result = `${value.slice(0, end)}...[结果已按预算截断]`;
  while (estimateTokens(result) > maxTokens && end > 1) {
    end = Math.max(1, Math.floor(end * 0.75));
    result = `${value.slice(0, end)}...[结果已按预算截断]`;
  }
  return estimateTokens(result) <= maxTokens ? result : "[结果已截断]";
}

function compactValue(value: unknown, maxTokens: number): unknown {
  if (estimateTokens(value) <= maxTokens) return value;

  if (typeof value === "string") return truncateString(value, maxTokens);
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    const marker = {
      __truncated: true,
      omittedItems: value.length,
    };
    const output: unknown[] = [];
    const candidateIndexes =
      value.length <= 8
        ? value.map((_, index) => index)
        : [0, 1, 2, 3, value.length - 4, value.length - 3, value.length - 2, value.length - 1];
    const uniqueIndexes = [...new Set(candidateIndexes)].filter(
      (index) => index >= 0 && index < value.length,
    );
    const itemBudget = Math.max(
      1,
      Math.floor((maxTokens - estimateTokens(marker)) / Math.max(1, uniqueIndexes.length)),
    );

    for (const index of uniqueIndexes) {
      const item = compactValue(value[index], itemBudget);
      const candidate = [...output, item, marker];
      if (estimateTokens(candidate) <= maxTokens) output.push(item);
    }

    const omittedItems = Math.max(0, value.length - output.length);
    const result = omittedItems > 0 ? [...output, { ...marker, omittedItems }] : output;
    return estimateTokens(result) <= maxTokens ? result : { __truncated: true, omittedItems };
  }

  const record = value as Record<string, unknown>;
  const importantKeys = [
    "sheet",
    "range",
    "values",
    "formulaPatterns",
    "formulaExceptions",
    "merges",
    "continuation",
    "objectType",
    "objects",
    "matches",
  ];
  const keys = [
    ...importantKeys.filter((key) => key in record),
    ...Object.keys(record).filter((key) => !importantKeys.includes(key)),
  ];
  const output: Record<string, unknown> = {};

  for (const key of keys) {
    const currentTokens = estimateTokens(output);
    const remainingTokens = maxTokens - currentTokens - estimateTokens({ __truncated: true });
    if (remainingTokens <= 1) break;

    const compacted = compactValue(record[key], remainingTokens);
    const candidate = { ...output, [key]: compacted };
    if (estimateTokens(candidate) <= maxTokens) output[key] = compacted;
  }

  const omittedKeys = Object.keys(record).filter((key) => !(key in output));
  if (omittedKeys.length > 0) {
    output.__truncated = true;
    output.__omittedKeys = omittedKeys;
  }
  return estimateTokens(output) <= maxTokens ? output : { __truncated: true, omittedKeys };
}

function compactToolResult(value: unknown, maxTokens: number, originalTokens: number): unknown {
  const compacted = compactValue(value, maxTokens);
  const markedCompacted =
    typeof compacted === "object" && compacted !== null && !Array.isArray(compacted)
      ? {
          ...(compacted as Record<string, unknown>),
          __truncated: true,
          __originalEstimatedTokens: originalTokens,
        }
      : compacted;
  if (estimateTokens(markedCompacted) <= maxTokens) return markedCompacted;

  return { __truncated: true };
}

export class ToolResultBudget {
  private readonly totalTokenLimit: number;
  private readonly maxResultTokenLimit: number;
  private readonly toolTokenLimits: Record<string, number>;
  private readonly toolPolicies: Record<string, ToolResultPolicy["kind"]>;
  private readonly toolTokens = new Map<string, number>();
  private readonly reservations = new Map<number, Reservation>();
  private usedTokenCount = 0;
  private reservedTokenCount = 0;
  private callCount = 0;
  private nextReservationId = 1;

  constructor(options: ToolResultBudgetOptions = {}) {
    this.totalTokenLimit = positiveInt(options.totalTokens, DEFAULT_TOOL_RESULT_BUDGET_TOKENS);
    this.maxResultTokenLimit = positiveInt(options.maxResultTokens, DEFAULT_TOOL_RESULT_MAX_TOKENS);
    this.toolTokenLimits = Object.fromEntries(
      Object.entries(options.toolBudgets ?? {}).map(([name, limit]) => [
        name,
        positiveInt(limit, this.totalTokenLimit),
      ]),
    );
    this.toolPolicies = Object.fromEntries(
      Object.entries(options.toolPolicies ?? {}).map(([name, policy]) => [name, policy.kind]),
    );
  }

  get snapshot(): ToolResultBudgetSnapshot {
    const usedTokens = this.usedTokenCount;
    const reservedTokens = this.reservedTokenCount;
    return {
      totalTokens: this.totalTokenLimit,
      usedTokens,
      reservedTokens,
      remainingTokens: Math.max(0, this.totalTokenLimit - usedTokens - reservedTokens),
      calls: this.callCount,
      toolTokens: Object.fromEntries(this.toolTokens),
    };
  }

  isToolExhausted(toolName: string): boolean {
    const toolLimit = this.toolTokenLimits[toolName] ?? this.totalTokenLimit;
    const toolUsed = this.toolTokens.get(toolName) ?? 0;
    return (
      toolUsed >= toolLimit || this.usedTokenCount + this.reservedTokenCount >= this.totalTokenLimit
    );
  }

  reserve(toolName: string): Reservation | TruncatedToolResult {
    this.callCount += 1;
    const usedByTool = this.toolTokens.get(toolName) ?? 0;
    const reservedByTool = [...this.reservations.values()]
      .filter((reservation) => reservation.toolName === toolName)
      .reduce((sum, reservation) => sum + reservation.tokenLimit, 0);
    const toolLimit = this.toolTokenLimits[toolName] ?? this.totalTokenLimit;
    const available = Math.min(
      this.totalTokenLimit - this.usedTokenCount - this.reservedTokenCount,
      toolLimit - usedByTool - reservedByTool,
      this.maxResultTokenLimit,
    );

    if (available < 1) return this.truncated(toolName);

    const reservation: Reservation = {
      id: this.nextReservationId++,
      toolName,
      tokenLimit: Math.floor(available),
      policy: this.toolPolicies[toolName] ?? "generic",
    };
    this.reservations.set(reservation.id, reservation);
    this.reservedTokenCount += reservation.tokenLimit;
    return reservation;
  }

  finish(reservation: Reservation, value: unknown): unknown {
    this.releaseReservation(reservation);
    const originalTokens = estimateTokens(value);
    if (originalTokens > reservation.tokenLimit && reservation.policy === "paged-structured") {
      const output = {
        ok: true,
        truncated: true,
        code: "TOOL_RESULT_TOO_LARGE" as const,
        tool: reservation.toolName,
        message: "结构化分页结果仍超过本次预算；工具未删除二维数据，请缩小 range 后重试。",
        budget: this.snapshot,
      };
      const outputTokens = Math.min(reservation.tokenLimit, estimateTokens(output));
      this.usedTokenCount += outputTokens;
      this.toolTokens.set(
        reservation.toolName,
        (this.toolTokens.get(reservation.toolName) ?? 0) + outputTokens,
      );
      return output;
    }
    const output =
      originalTokens <= reservation.tokenLimit
        ? value
        : compactToolResult(value, reservation.tokenLimit, originalTokens);
    const outputTokens = Math.min(reservation.tokenLimit, estimateTokens(output));
    this.usedTokenCount += outputTokens;
    this.toolTokens.set(
      reservation.toolName,
      (this.toolTokens.get(reservation.toolName) ?? 0) + outputTokens,
    );
    return output;
  }

  fail(reservation: Reservation): void {
    this.releaseReservation(reservation);
  }

  private releaseReservation(reservation: Reservation): void {
    if (!this.reservations.delete(reservation.id)) return;
    this.reservedTokenCount = Math.max(0, this.reservedTokenCount - reservation.tokenLimit);
  }

  private truncated(toolName: string): TruncatedToolResult {
    const toolLimit = this.toolTokenLimits[toolName] ?? this.totalTokenLimit;
    const toolUsed = this.toolTokens.get(toolName) ?? 0;
    const reason =
      toolUsed >= toolLimit
        ? `工具 ${toolName} 的本轮结果预算已达到上限`
        : "本轮工具结果预算已达到上限";
    return {
      ok: true,
      truncated: true,
      code: "TOOL_RESULT_TRUNCATED",
      tool: toolName,
      message: `${reason}，本次调用自动省略明细；请基于已返回的数据继续回答，或在下一轮缩小范围。`,
      budget: this.snapshot,
    };
  }
}

export function wrapToolSetWithResultBudget<T extends BudgetableToolSet>(
  tools: T,
  budget: ToolResultBudget,
): T {
  const wrapped = Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => {
      if (typeof tool.execute !== "function") return [name, tool];

      const execute = tool.execute;
      return [
        name,
        {
          ...tool,
          execute: async (input: unknown, options?: unknown) => {
            const reservation = budget.reserve(name);
            if (isTruncatedToolResult(reservation)) return reservation;

            try {
              const executionOptions =
                options && typeof options === "object"
                  ? {
                      ...(options as Record<string, unknown>),
                      resultBudget: {
                        maxTokens: reservation.tokenLimit,
                        policy: reservation.policy,
                      } satisfies ToolExecutionBudget,
                    }
                  : {
                      resultBudget: {
                        maxTokens: reservation.tokenLimit,
                        policy: reservation.policy,
                      } satisfies ToolExecutionBudget,
                    };
              const result = await execute(input, executionOptions);
              return budget.finish(reservation, result);
            } catch (error) {
              budget.fail(reservation);
              throw error;
            }
          },
        },
      ];
    }),
  );
  return wrapped as T;
}

function isTruncatedToolResult(
  value: Reservation | TruncatedToolResult,
): value is TruncatedToolResult {
  return "truncated" in value;
}

export function serializeToolResult(value: unknown): string {
  return stringify(value);
}
