export interface CanonicalBorderSide {
  s: number;
  c?: string;
}

export interface CanonicalCellStyle {
  bg?: string;
  fc?: string;
  fs?: number;
  ff?: string;
  bl?: number;
  it?: number;
  cl?: number;
  un?: number;
  ht?: number;
  vt?: number;
  tb?: string;
  ct?: { fa?: string; t?: string };
  bd?: {
    t?: CanonicalBorderSide;
    b?: CanonicalBorderSide;
    l?: CanonicalBorderSide;
    r?: CanonicalBorderSide;
  };
}

const STYLE_KEYS = [
  "bg",
  "fc",
  "fs",
  "ff",
  "bl",
  "it",
  "cl",
  "un",
  "ht",
  "vt",
  "tb",
  "ct",
  "bd",
] as const satisfies ReadonlyArray<keyof CanonicalCellStyle>;

export interface DocumentStyleDefinition {
  id: string;
  style: CanonicalCellStyle;
}

export function mergeCellStyles(
  base: CanonicalCellStyle | undefined,
  patch: Partial<CanonicalCellStyle>,
): CanonicalCellStyle | null {
  const merged = {
    ...(base ?? {}),
    ...patch,
    ...(base?.ct || patch.ct ? { ct: { ...base?.ct, ...patch.ct } } : {}),
    ...(base?.bd || patch.bd
      ? {
          bd: {
            ...base?.bd,
            ...patch.bd,
            ...(base?.bd?.t || patch.bd?.t ? { t: { ...base?.bd?.t, ...patch.bd?.t } } : {}),
            ...(base?.bd?.b || patch.bd?.b ? { b: { ...base?.bd?.b, ...patch.bd?.b } } : {}),
            ...(base?.bd?.l || patch.bd?.l ? { l: { ...base?.bd?.l, ...patch.bd?.l } } : {}),
            ...(base?.bd?.r || patch.bd?.r ? { r: { ...base?.bd?.r, ...patch.bd?.r } } : {}),
          },
        }
      : {}),
  };
  return normalizeCellStyle(merged);
}

export function createStyleDefinition(style: CanonicalCellStyle): DocumentStyleDefinition | null {
  const normalized = normalizeCellStyle(style);
  return normalized ? { id: cellStyleId(normalized), style: normalized } : null;
}

export type DocumentStyleResolver =
  | ReadonlyMap<string, CanonicalCellStyle>
  | Readonly<Record<string, CanonicalCellStyle>>
  | ((styleId: string) => CanonicalCellStyle | undefined);

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeValue(entry)]),
    );
  }
  return value;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeValue(value)) ?? "null";
}

function hashString(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function normalizeCellStyle(value: object): CanonicalCellStyle | null {
  const candidate = value as Partial<CanonicalCellStyle>;
  const style = Object.fromEntries(
    STYLE_KEYS.flatMap((key) =>
      candidate[key] === undefined ? [] : ([[key, candidate[key]]] as const),
    ),
  ) as CanonicalCellStyle;
  return Object.keys(style).length > 0 ? (normalizeValue(style) as CanonicalCellStyle) : null;
}

export function extractCellStyle(value: object): CanonicalCellStyle | null {
  return normalizeCellStyle(value);
}

export function cellStyleId(style: CanonicalCellStyle): string {
  return `style_${hashString(stableStringify(normalizeValue(style)))}`;
}

export function collectDocumentStyles<T extends { v: object }>(
  celldata: T[],
): Map<string, CanonicalCellStyle> {
  const styles = new Map<string, CanonicalCellStyle>();
  for (const cell of celldata) {
    const style = extractCellStyle(cell.v);
    if (style) styles.set(cellStyleId(style), style);
  }
  return styles;
}

export function stripCellStyle(value: object): Record<string, unknown> {
  const metadata = { ...value } as Record<string, unknown>;
  for (const key of ["v", "m", "f", ...STYLE_KEYS]) delete metadata[key];
  return metadata;
}

export function resolveCellStyle(
  styleId: string | undefined,
  resolver: DocumentStyleResolver | undefined,
): CanonicalCellStyle | undefined {
  if (!styleId || !resolver) return undefined;
  if (typeof resolver === "function") return resolver(styleId);
  const mapResolver = resolver as ReadonlyMap<string, CanonicalCellStyle>;
  if (typeof mapResolver.get === "function") return mapResolver.get(styleId);
  return (resolver as Readonly<Record<string, CanonicalCellStyle>>)[styleId];
}

export function applyCellStyle<T extends object>(
  value: T,
  styleId: string | undefined,
  resolver: DocumentStyleResolver | undefined,
): T {
  const style = resolveCellStyle(styleId, resolver);
  return style ? ({ ...value, ...style } as T) : value;
}
