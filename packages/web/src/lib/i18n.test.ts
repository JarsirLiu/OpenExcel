import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLocale,
  getLocaleKeyDifferences,
  getMissingTranslationKeys,
  resolveLocale,
  setLocale,
  t,
} from "./i18n";
import type { TranslationKey } from "./locales/en-US";

describe("i18n", () => {
  beforeEach(() => {
    setLocale("zh-CN");
    localStorage.clear();
  });

  it("defaults to simplified Chinese without a persisted locale", async () => {
    vi.resetModules();
    const freshI18n = await import("./i18n");

    expect(freshI18n.getLocale()).toBe("zh-CN");
  });

  it("uses a persisted supported locale during startup", async () => {
    localStorage.setItem("openexcel.locale", "en-US");
    vi.resetModules();
    const freshI18n = await import("./i18n");

    expect(freshI18n.getLocale()).toBe("en-US");
  });

  it("keeps locale resources complete", () => {
    expect(getLocaleKeyDifferences()).toEqual({ "en-US": [], "zh-CN": [] });
  });

  it("normalizes browser locale preferences", () => {
    expect(resolveLocale("en-GB")).toBe("en-US");
    expect(resolveLocale("zh-TW")).toBe("zh-CN");
    expect(resolveLocale("fr-FR")).toBe("en-US");
  });

  it("translates using the active locale", () => {
    setLocale("en-US");
    expect(t("loading")).toBe("Loading...");
    setLocale("zh-CN");
    expect(t("loading")).toBe("加载中…");
    expect(getMissingTranslationKeys()).toEqual([]);
  });

  it("interpolates string and numeric variables without changing the resource", () => {
    setLocale("zh-CN");
    expect(t("confirm_delete_named", { name: "Budget" })).toBe(
      "确认删除「Budget」？此操作不可恢复。",
    );
    expect(t("max_workbook_import_count", { count: 3 })).toBe("一次最多选择 3 个文件");

    setLocale("en-US");
    expect(t("confirm_delete_named", { name: "Budget" })).toBe(
      'Delete "Budget"? This action cannot be undone.',
    );
  });

  it("persists locale changes and updates the document language", () => {
    setLocale("en-US");

    expect(getLocale()).toBe("en-US");
    expect(localStorage.getItem("openexcel.locale")).toBe("en-US");
    expect(document.documentElement.lang).toBe("en-US");
  });

  it("keeps missing translation keys visible and warns only once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const missingKey = "missing_test_key" as TranslationKey;

    try {
      expect(t(missingKey)).toBe(missingKey);
      expect(t(missingKey)).toBe(missingKey);
      expect(getMissingTranslationKeys()).toContain(missingKey);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(`[i18n] Missing translation key: ${missingKey}`);
    } finally {
      warn.mockRestore();
    }
  });
});
