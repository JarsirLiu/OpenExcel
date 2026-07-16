export type ExcelColorInput = {
  rgb?: string;
  indexed?: number;
  theme?: number;
  tint?: number;
};

const indexedColors: Record<number, string> = {
  0: "#000000",
  1: "#FFFFFF",
  2: "#FF0000",
  3: "#00FF00",
  4: "#0000FF",
  5: "#FFFF00",
  6: "#FF00FF",
  7: "#00FFFF",
  8: "#000000",
  9: "#FFFFFF",
};

const themeColors: Record<number, string> = {
  0: "#000000",
  1: "#FFFFFF",
  2: "#1F497D",
  3: "#EEECE1",
  4: "#4F81BD",
  5: "#C0504D",
  6: "#9BBB59",
  7: "#8064A2",
  8: "#4BACC6",
  9: "#F79646",
};

// FortuneSheet/Luckysheet border codes are also the codes emitted by
// @corbe30/fortune-excel. Keep this table as the only numeric border mapping.
const fortuneToExcelBorderStyles: Record<number, string> = {
  0: "none",
  1: "thin",
  2: "hair",
  3: "dotted",
  4: "dashed",
  5: "dashDot",
  6: "dashDotDot",
  7: "double",
  8: "medium",
  9: "mediumDashed",
  10: "mediumDashDot",
  11: "mediumDashDotDot",
  12: "slantDashDot",
  13: "thick",
};

const excelToFortuneBorderStyles: Record<string, number> = Object.fromEntries(
  Object.entries(fortuneToExcelBorderStyles).map(([key, value]) => [value, Number(key)]),
);

function applyTint(hex: string, tint?: number): string {
  if (tint == null || tint === 0) return hex;
  const normalized = normalizeHex(hex);
  if (!normalized) return hex;
  const hasAlpha = normalized.length === 9;
  const alpha = hasAlpha ? normalized.slice(1, 3) : "FF";
  const value = Number.parseInt(normalized.slice(-6), 16);
  const channels = [value >> 16, (value >> 8) & 0xff, value & 0xff].map((channel) =>
    tint < 0 ? channel * (1 + tint) : channel + (255 - channel) * tint,
  );
  const tinted = channels
    .map((channel) =>
      Math.max(0, Math.min(255, Math.round(channel)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase();
  return `#${hasAlpha ? alpha : ""}${tinted}`;
}

function normalizeHex(value: string): string | undefined {
  const hex = value.replace(/^#/, "");
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) return undefined;
  return `#${hex.toUpperCase()}`;
}

export function excelColorToFortune(color?: ExcelColorInput | string): string | undefined {
  if (!color) return undefined;
  if (typeof color === "string") return normalizeHex(color);

  const hex = color.rgb
    ? normalizeHex(color.rgb)
    : color.indexed != null
      ? indexedColors[color.indexed]
      : color.theme != null
        ? themeColors[color.theme]
        : undefined;
  return hex ? applyTint(hex, color.tint) : undefined;
}

export function fortuneColorToArgb(color?: string): string | undefined {
  const normalized = color ? normalizeHex(color) : undefined;
  if (!normalized) return undefined;
  return normalized.length === 9 ? normalized.slice(1) : `FF${normalized.slice(1)}`;
}

export function fortuneHorizontalToExcel(value?: number): "left" | "center" | "right" | undefined {
  switch (value) {
    case 0:
      return "center";
    case 1:
      return "left";
    case 2:
      return "right";
    default:
      return undefined;
  }
}

export function excelHorizontalToFortune(value?: string): number | undefined {
  switch (value?.toLowerCase()) {
    case "center":
      return 0;
    case "left":
      return 1;
    case "right":
      return 2;
    default:
      return undefined;
  }
}

export function fortuneVerticalToExcel(value?: number): "middle" | "top" | "bottom" | undefined {
  switch (value) {
    case 0:
      return "middle";
    case 1:
      return "top";
    case 2:
      return "bottom";
    default:
      return undefined;
  }
}

export function excelVerticalToFortune(value?: string): number | undefined {
  switch (value?.toLowerCase()) {
    case "center":
    case "middle":
      return 0;
    case "top":
      return 1;
    case "bottom":
      return 2;
    default:
      return undefined;
  }
}

export function fortuneWrapToExcel(value?: string | number): boolean | undefined {
  if (value == null) return undefined;
  return String(value) === "2";
}

export function excelWrapToFortune(value?: boolean): string | undefined {
  if (value == null) return undefined;
  return value ? "2" : "1";
}

export function fortuneBorderStyleToExcel(value?: number): string | undefined {
  return value == null || value === 0 ? undefined : fortuneToExcelBorderStyles[value];
}

export function excelBorderStyleToFortune(value?: string | number): number | undefined {
  if (typeof value === "number") return value >= 0 && value <= 13 ? value : undefined;
  return value == null ? undefined : excelToFortuneBorderStyles[value];
}
