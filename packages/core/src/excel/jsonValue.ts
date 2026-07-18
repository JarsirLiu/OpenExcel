export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function normalizeJsonValue(value: unknown, active: WeakSet<object>): JsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
    throw new Error("导入数据包含无法 JSON 持久化的值");
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") throw new Error("导入数据包含无法 JSON 持久化的值");
  if (active.has(value)) throw new Error("导入数据包含循环引用");

  active.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => normalizeJsonValue(item, active) ?? null);
    }

    const result: { [key: string]: JsonValue } = {};
    for (const [key, item] of Object.entries(value)) {
      const normalized = normalizeJsonValue(item, active);
      if (normalized !== undefined) result[key] = normalized;
    }
    return result;
  } finally {
    active.delete(value);
  }
}

export function toJsonValue(value: unknown): JsonValue | undefined {
  return normalizeJsonValue(value, new WeakSet<object>());
}

export function toJsonObject(value: unknown): { [key: string]: JsonValue } {
  const normalized = toJsonValue(value);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    throw new Error("导入配置必须是 JSON 对象");
  }
  return normalized;
}
