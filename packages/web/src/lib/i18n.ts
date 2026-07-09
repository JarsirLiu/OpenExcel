const translations: Record<string, string> = {};

type TemplateVars = Record<string, string | number>;

export function t(key: string, fallback: string, vars?: TemplateVars): string {
  const text = translations[key] ?? fallback;
  if (!vars) return text;
  let result = text;
  for (const [k, v] of Object.entries(vars)) {
    result = result.replace(`{${k}}`, String(v));
  }
  return result;
}
