import type { Template, SheetDef } from "../types/index.js";

/**
 * 将任意嵌套 JSON 动态拆解为多 Sheet 模板。
 *
 * 策略规则（参考 create_template.py 的逻辑）：
 *   1. 顶层 key → 分组（如 "经营概览"）
 *   2. 分组下 简单键值对 → KV 表 [指标, 数值]
 *   3. 分组下 嵌套对象 → 多列表格（子 key 做列头）
 *   4. 分组下 对象数组 → 表格（数组元素字段做列头）
 *   5. 每个分组可能拆成 1 个或多个 Sheet
 */
export function jsonToTemplate(json: Record<string, any>, id: string, name: string): Template {
  const sheets: SheetDef[] = [];

  for (const [groupKey, groupValue] of Object.entries(json)) {
    if (typeof groupValue !== "object" || groupValue === null) continue;
    const groupSheets = flattenGroup(groupKey, groupValue);
    sheets.push(...groupSheets);
  }

  return {
    id,
    name,
    groups: Object.keys(json),
    sheets,
  };
}

function flattenGroup(groupKey: string, value: Record<string, any>, depth = 0): SheetDef[] {
  const results: SheetDef[] = [];

  for (const [key, val] of Object.entries(value)) {
    if (Array.isArray(val)) {
      // 对象数组 → 表格
      const sheet = arrayToSheet(key, val);
      if (sheet) results.push(sheet);
    } else if (isSimpleObject(val)) {
      // 嵌套对象 → 多列键值表
      results.push(nestedObjectToSheet(key, val));
    } else if (isPrimitive(val)) {
      // 简单键值对 → 如果已经是顶层，做成 KV sheet
      if (depth === 0) {
        results.push(kvToSheet(groupKey, value));
        break; // 整个 value 已消费
      }
    }
  }

  // 如果没有任何子项被解析（空对象或纯 KV），兜底生成 KV sheet
  if (results.length === 0 && isSimpleObject(value)) {
    results.push(kvToSheet(groupKey, value));
  }

  return results;
}

function isPrimitive(v: any): boolean {
  return v === null || v === undefined || typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

function isSimpleObject(v: any): boolean {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  return Object.values(v).every((x) => isPrimitive(x) || (typeof x === "object" && x !== null && !Array.isArray(x) && Object.values(x).every(isPrimitive)));
}

/** 简单键值对 → [指标, 数值] 表 */
function kvToSheet(sheetName: string, obj: Record<string, any>): SheetDef {
  const rows: string[][] = [];
  let hasValues = false;

  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "object" && v !== null) {
      // 嵌套对象：展平为多列
      const subEntries = Object.entries(v);
      rows.push([k, ...subEntries.map(([, sv]) => String(sv ?? ""))]);
      if (!hasValues && subEntries.length > 0) hasValues = true;
    } else {
      rows.push([k, String(v ?? "")]);
      if (v !== "" && v !== null && v !== undefined) hasValues = true;
    }
  }

  const colCount = Math.max(1, ...rows.map((r) => r.length));

  return {
    name: sheetName,
    columns: colCount <= 2
      ? [{ label: "指标名称", width: 250 }, { label: "数值", width: 250 }]
      : [{ label: "项目", width: 200 }, ...Array.from({ length: colCount - 1 }, (_, i) => ({ label: `列${i + 1}`, width: 180 }))],
    rows,
  };
}

/** 嵌套对象 → 多列表格 */
function nestedObjectToSheet(sheetName: string, obj: Record<string, any>): SheetDef {
  const allKeys = new Set<string>();
  const rows: string[][] = [];

  for (const [, val] of Object.entries(obj)) {
    if (typeof val === "object" && val !== null) {
      Object.keys(val).forEach((k) => allKeys.add(k));
    }
  }

  const sortedKeys = Array.from(allKeys);

  for (const [k, val] of Object.entries(obj)) {
    if (typeof val === "object" && val !== null) {
      rows.push([k, ...sortedKeys.map((sk) => String((val as any)[sk] ?? ""))]);
    } else {
      rows.push([k, String(val ?? "")]);
    }
  }

  const columns = [{ label: "项目", width: 150 }, ...sortedKeys.map((k) => ({ label: k, width: 180 }))];
  return { name: sheetName, columns, rows };
}

/** 对象数组 → 表格 Sheet */
function arrayToSheet(sheetName: string, arr: Record<string, any>[]): SheetDef | null {
  if (arr.length === 0) return null;

  const allKeys = new Set<string>();
  for (const item of arr) {
    if (typeof item === "object" && item !== null) {
      Object.keys(item).forEach((k) => allKeys.add(k));
    }
  }

  const sortedKeys = Array.from(allKeys);
  const columns = sortedKeys.map((k) => ({ label: k, width: 180 }));
  const rows = arr.map((item) => sortedKeys.map((k) => {
    const v = item[k];
    if (typeof v === "object" && v !== null) return JSON.stringify(v);
    return String(v ?? "");
  }));

  return { name: sheetName, columns, rows: rows.length > 0 ? rows : [sortedKeys.map(() => "")] };
}
