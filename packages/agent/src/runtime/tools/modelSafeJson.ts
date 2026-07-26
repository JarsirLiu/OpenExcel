export type ModelSafeJsonValue =
  | null
  | string
  | number
  | boolean
  | ModelSafeJsonValue[]
  | { [key: string]: ModelSafeJsonValue };

/**
 * Converts an executor result into the JSON value accepted by AI SDK model
 * messages. This is the Agent/adapter boundary: persistence objects and
 * provider-specific values must not leak into the model loop.
 */
export function toModelSafeJsonValue(value: unknown): ModelSafeJsonValue {
  return convert(value, new WeakSet<object>(), "$");
}

function convert(value: unknown, seen: WeakSet<object>, path: string): ModelSafeJsonValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (value === undefined) return null;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new TypeError(`Tool output contains an invalid Date at ${path}`);
    }
    return value.toISOString();
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value !== "object") {
    throw new TypeError(`Tool output contains unsupported value at ${path}`);
  }

  if (seen.has(value)) {
    throw new TypeError(`Tool output contains a circular reference at ${path}`);
  }
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((entry, index) => convert(entry, seen, `${path}[${index}]`));
    }

    const output: { [key: string]: ModelSafeJsonValue } = {};
    for (const [key, entry] of Object.entries(value)) {
      // Match JSON.stringify semantics for optional object properties while
      // keeping array positions stable (array undefined values become null).
      if (entry === undefined) continue;
      output[key] = convert(entry, seen, `${path}.${key}`);
    }
    return output;
  } finally {
    seen.delete(value);
  }
}
