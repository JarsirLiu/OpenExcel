import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { enUS, type TranslationKey } from "./locales/en-US";
import { zhCN } from "./locales/zh-CN";

export const supportedLocales = ["en-US", "zh-CN"] as const;
export type Locale = (typeof supportedLocales)[number];
type TemplateVars = Record<string, string | number>;
type Messages = Record<TranslationKey, string>;

const messages: Record<Locale, Messages> = { "en-US": enUS, "zh-CN": zhCN };
const localeStorageKey = "openexcel.locale";
let activeLocale: Locale = resolveInitialLocale();
const missingKeys = new Set<string>();

function isLocale(value: string | null | undefined): value is Locale {
  return value === "en-US" || value === "zh-CN";
}

export function resolveLocale(value: string | null | undefined): Locale {
  if (isLocale(value)) return value;
  const normalized = value?.toLowerCase() ?? "";
  if (normalized === "en" || normalized.startsWith("en-")) return "en-US";
  if (normalized === "zh" || normalized.startsWith("zh-")) return "zh-CN";
  return "en-US";
}

function readStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(localeStorageKey);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

function resolveInitialLocale(): Locale {
  if (typeof window === "undefined") return "zh-CN";
  return readStoredLocale() ?? "zh-CN";
}

export function getLocale(): Locale {
  return activeLocale;
}

export function setLocale(locale: Locale): void {
  activeLocale = locale;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(localeStorageKey, locale);
    } catch {
      // Local storage can be unavailable in private or restricted browser contexts.
    }
    document.documentElement.lang = locale;
  }
}

function interpolate(text: string, vars?: TemplateVars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

export function t(key: TranslationKey, vars?: TemplateVars): string {
  const text = messages[activeLocale][key];
  if (text === undefined) {
    if (!missingKeys.has(key)) {
      missingKeys.add(key);
      console.warn(`[i18n] Missing translation key: ${key}`);
    }
    return key;
  }
  return interpolate(text, vars);
}

export function getMissingTranslationKeys(): string[] {
  return [...missingKeys].sort();
}

export function getLocaleKeyDifferences(): Record<Locale, string[]> {
  const referenceKeys = new Set(Object.keys(enUS));
  const differences: Record<Locale, string[]> = { "en-US": [], "zh-CN": [] };
  for (const locale of supportedLocales) {
    differences[locale] = [...referenceKeys].filter((key) => !(key in messages[locale])).sort();
  }
  return differences;
}

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: typeof t;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<Locale>(activeLocale);

  activeLocale = locale;
  useEffect(() => {
    setLocale(locale);
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale: updateLocale, t }), [locale]);
  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}
