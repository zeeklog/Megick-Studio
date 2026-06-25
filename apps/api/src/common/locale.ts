export const supportedLocales = ["zh-CN", "zh-TW", "en", "ja", "fr", "de"] as const;
export type AppLocale = (typeof supportedLocales)[number];

export const DEFAULT_LOCALE: AppLocale = "en";
export const FALLBACK_LOCALE: AppLocale = "en";

export type LocalizedMessages<Key extends string> =
  Record<"en" | "zh-CN", Record<Key, string>> &
    Partial<Record<AppLocale, Partial<Record<Key, string>>>>;

function parseSupportedLocale(value: unknown): AppLocale | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/_/g, "-");
  if (
    normalized === "zh-tw" ||
    normalized === "zh-hk" ||
    normalized === "zh-mo" ||
    normalized === "zh-hant" ||
    normalized.startsWith("zh-tw-") ||
    normalized.startsWith("zh-hk-") ||
    normalized.startsWith("zh-mo-") ||
    normalized.startsWith("zh-hant-")
  ) {
    return "zh-TW";
  }
  if (normalized === "zh" || normalized === "zh-cn" || normalized === "zh-hans" || normalized.startsWith("zh-hans-")) {
    return "zh-CN";
  }
  if (normalized.startsWith("ja")) return "ja";
  if (normalized.startsWith("fr")) return "fr";
  if (normalized.startsWith("de")) return "de";
  if (normalized.startsWith("en")) return "en";
  return null;
}

export function normalizeLocale(value: unknown): AppLocale {
  return parseSupportedLocale(value) ?? FALLBACK_LOCALE;
}

export function localeFromAcceptLanguage(value: unknown): AppLocale {
  if (typeof value !== "string") return DEFAULT_LOCALE;
  const languageTags = value
    .split(",")
    .map((entry) => entry.trim().split(";")[0])
    .filter(Boolean);
  for (const languageTag of languageTags) {
    const locale = parseSupportedLocale(languageTag);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

export function localizedText<Key extends string>(
  messages: LocalizedMessages<Key>,
  locale: AppLocale | undefined,
  key: Key,
) {
  const targetLocale = locale ?? DEFAULT_LOCALE;
  return messages[targetLocale]?.[key] ?? messages[FALLBACK_LOCALE]?.[key] ?? key;
}
