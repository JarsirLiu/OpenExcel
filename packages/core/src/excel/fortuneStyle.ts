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

const colorQueryAliases: Record<string, string> = {
  红色: "#FF0000",
  red: "#FF0000",
  绿色: "#00FF00",
  green: "#00FF00",
  蓝色: "#0000FF",
  blue: "#0000FF",
  黄色: "#FFFF00",
  yellow: "#FFFF00",
  黑色: "#000000",
  black: "#000000",
  白色: "#FFFFFF",
  white: "#FFFFFF",
};

const colorQueryNames: Record<string, string> = {
  "#000000": "黑色 (black)",
  "#FFFFFF": "白色 (white)",
  "#FF0000": "红色 (red)",
  "#00FF00": "绿色 (green)",
  "#0000FF": "蓝色 (blue)",
  "#FFFF00": "黄色 (yellow)",
  "#FFF2CC": "浅黄色 (light yellow)",
  "#FCE4D6": "浅橙色 (light orange)",
  "#F4B183": "橙色 (orange)",
  "#E2F0D9": "浅绿色 (light green)",
  "#92D050": "绿色 (green)",
  "#DDEBF7": "浅蓝色 (light blue)",
  "#D9E1F2": "淡蓝色 (pale blue)",
  "#F2F2F2": "浅灰色 (light gray)",
  "#D9D9D9": "灰色 (gray)",
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
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex
      .split("")
      .map((channel) => `${channel}${channel}`)
      .join("")
      .toUpperCase()}`;
  }
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) return undefined;
  const normalized = hex.toUpperCase();
  return normalized.length === 8 && normalized.startsWith("FF")
    ? `#${normalized.slice(2)}`
    : `#${normalized}`;
}

export function normalizeColorQuery(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const input = value.trim();
  if (!input) return undefined;
  const alias = colorQueryAliases[input.toLowerCase()];
  return alias ?? normalizeHex(input);
}

export function describeColor(value: unknown): string {
  const normalized = normalizeColorQuery(value);
  return normalized ? (colorQueryNames[normalized] ?? "自定义颜色 (custom color)") : "未知颜色";
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
