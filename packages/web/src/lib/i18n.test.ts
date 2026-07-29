import { describe, expect, it } from "vitest";
import {
  getLocaleKeyDifferences,
  getMissingTranslationKeys,
  resolveLocale,
  setLocale,
  t,
} from "./i18n";

describe("i18n", () => {
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
});
