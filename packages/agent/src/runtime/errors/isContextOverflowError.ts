function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return String(error);
  const record = error as Record<string, unknown>;
  return [record.message, record.error, record.responseBody, record.data]
    .filter((value) => value !== undefined)
    .map((value) => (typeof value === "string" ? value : JSON.stringify(value)))
    .join(" ");
}

export function isContextOverflowError(error: unknown): boolean {
  const text = errorText(error).toLowerCase();
  return /context.{0,20}(window|length|limit|overflow)|maximum.{0,20}tokens|too many tokens|prompt is too long|input.{0,20}token.{0,20}limit/.test(
    text,
  );
}
