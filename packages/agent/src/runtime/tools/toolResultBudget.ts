import { estimateTokens } from "../../session/contextWindow.js";
import type { ToolExecutionRequest } from "../contracts.js";
import { ToolExecutionError } from "./errors.js";

export interface ToolResultPolicy {
  /** Maximum model-visible result size for one invocation. */
  maxTokens: number;
  /** Produces a tool-owned model projection without changing its contract shape. */
  compact: (value: unknown) => unknown;
  /** Optional runtime validation for the compacted model projection. */
  validate?: (value: unknown) => boolean;
}

export interface ToolResultBudgetOptions {
  toolPolicies: Record<string, ToolResultPolicy>;
}

export interface ToolResultBudgetSnapshot {
  calls: number;
  toolTokens: Record<string, number>;
}

interface Reservation {
  toolName: string;
  policy: ToolResultPolicy;
}

function positiveInt(value: number, toolName: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Tool ${toolName} has an invalid result budget`);
  }
  return value;
}

export class ToolResultBudget {
  private readonly toolPolicies: Record<string, ToolResultPolicy>;
  private readonly toolTokens = new Map<string, number>();
  private callCount = 0;

  constructor(options: ToolResultBudgetOptions) {
    this.toolPolicies = Object.fromEntries(
      Object.entries(options.toolPolicies).map(([name, policy]) => [
        name,
        { ...policy, maxTokens: positiveInt(policy.maxTokens, name) },
      ]),
    );
  }

  get snapshot(): ToolResultBudgetSnapshot {
    return {
      calls: this.callCount,
      toolTokens: Object.fromEntries(this.toolTokens),
    };
  }

  reserve(toolName: string): Reservation {
    const policy = this.toolPolicies[toolName];
    if (!policy) {
      throw new ToolExecutionError(`Tool ${toolName} has no result budget policy`, {
        toolName,
      });
    }
    this.callCount += 1;
    return { toolName, policy };
  }

  finish(reservation: Reservation, value: unknown): unknown {
    const originalTokens = estimateTokens(value);
    const output =
      originalTokens <= reservation.policy.maxTokens ? value : reservation.policy.compact(value);
    const outputTokens = estimateTokens(output);

    if (outputTokens > reservation.policy.maxTokens) {
      throw new ToolExecutionError(
        `Tool ${reservation.toolName} could not produce a model result within its result budget`,
        {
          toolName: reservation.toolName,
          maxTokens: reservation.policy.maxTokens,
          estimatedTokens: outputTokens,
        },
      );
    }
    if (reservation.policy.validate && !reservation.policy.validate(output)) {
      throw new ToolExecutionError(
        `Tool ${reservation.toolName} produced an invalid compacted result`,
        { toolName: reservation.toolName },
      );
    }

    this.toolTokens.set(
      reservation.toolName,
      (this.toolTokens.get(reservation.toolName) ?? 0) + outputTokens,
    );
    return output;
  }
}
