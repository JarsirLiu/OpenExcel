import { createHash } from "node:crypto";
import type { SheetCommand } from "@openexcel/core";

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);
    return `{${entries.join(",")}}`;
  }
  throw new Error("Sheet command contains a non-JSON value");
}

export function sheetCommandFingerprint(command: SheetCommand): string {
  const identity =
    command.kind === "mutation"
      ? {
          kind: command.kind,
          mutationId: command.mutationId,
          sheetId: command.sheetId,
          mutation: command.mutation,
        }
      : {
          kind: command.kind,
          mutationId: command.mutationId,
          sheetId: command.sheetId,
          snapshot: command.snapshot,
        };

  return createHash("sha256").update(canonicalJson(identity), "utf8").digest("hex");
}
