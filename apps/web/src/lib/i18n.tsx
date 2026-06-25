import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { shellMessages } from "@/lib/locales/app/app-shell";

export const supportedLocales = ["zh-CN", "zh-TW", "en", "ja", "fr", "de"] as const;
export type AppLocale = (typeof supportedLocales)[number];
export type LocaleSource = "device" | "explicit";
export const DEFAULT_LOCALE: AppLocale = "en";
export const FALLBACK_LOCALE: AppLocale = "en";

export const localeLabels: Record<AppLocale, string> = {
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  en: "English",
  ja: "日本語",
  fr: "Français",
  de: "Deutsch",
};

export const localeShortLabels: Record<AppLocale, string> = {
  "zh-CN": "简",
  "zh-TW": "繁",
  en: "EN",
  ja: "日",
  fr: "FR",
  de: "DE",
};

const intlLocaleMap: Record<AppLocale, string> = {
  "zh-CN": "zh-CN",
  "zh-TW": "zh-TW",
  en: "en-US",
  ja: "ja-JP",
  fr: "fr-FR",
  de: "de-DE",
};

const ogLocaleMap: Record<AppLocale, string> = {
  "zh-CN": "zh_CN",
  "zh-TW": "zh_TW",
  en: "en_US",
  ja: "ja_JP",
  fr: "fr_FR",
  de: "de_DE",
};

export const I18N_STORAGE_KEY = "megick.locale";
export const I18N_LOCALE_SOURCE_STORAGE_KEY = `${I18N_STORAGE_KEY}.source`;
export const I18N_LOCALE_UPDATED_AT_STORAGE_KEY = `${I18N_STORAGE_KEY}.updatedAt`;
export const I18N_LOCALE_PENDING_SYNC_STORAGE_KEY = `${I18N_STORAGE_KEY}.pendingSync`;
const legacyExplicitPreferenceMarkerKey = `${I18N_STORAGE_KEY}.explicit`;
const localeCookieMaxAgeSeconds = 31_536_000;

function readLocaleCookie(cookieSource: string): AppLocale | null {
  const parts = cookieSource.split(";");
  for (const part of parts) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey !== I18N_STORAGE_KEY) continue;
    return normalizeLocale(rawValue.join("="));
  }
  return null;
}

function readCookieValue(cookieSource: string, key: string): string | null {
  const parts = cookieSource.split(";");
  for (const part of parts) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey !== key) continue;
    return decodeURIComponent(rawValue.join("="));
  }
  return null;
}

function writeCookie(key: string, value: string) {
  document.cookie = `${key}=${encodeURIComponent(value)}; Path=/; Max-Age=${localeCookieMaxAgeSeconds}; SameSite=Lax`;
}

function readStoredLocaleSource(): LocaleSource {
  if (typeof window === "undefined") return "device";
  try {
    const source = window.localStorage.getItem(I18N_LOCALE_SOURCE_STORAGE_KEY);
    if (source === "explicit") return "explicit";
    if (window.localStorage.getItem(legacyExplicitPreferenceMarkerKey) === "1") return "explicit";
  } catch {
    // localStorage may be unavailable in private browsing.
  }
  const cookieSource = readCookieValue(window.document.cookie, I18N_LOCALE_SOURCE_STORAGE_KEY);
  if (cookieSource === "explicit") return "explicit";
  return readCookieValue(window.document.cookie, legacyExplicitPreferenceMarkerKey) === "1"
    ? "explicit"
    : "device";
}

export function persistExplicitLocalePreference(
  locale: AppLocale,
  updatedAt = new Date().toISOString(),
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(I18N_STORAGE_KEY, locale);
    window.localStorage.setItem(I18N_LOCALE_SOURCE_STORAGE_KEY, "explicit");
    window.localStorage.setItem(I18N_LOCALE_UPDATED_AT_STORAGE_KEY, updatedAt);
    window.localStorage.setItem(legacyExplicitPreferenceMarkerKey, "1");
  } catch {
    // localStorage may be unavailable in private browsing.
  }
  writeCookie(I18N_STORAGE_KEY, locale);
  writeCookie(I18N_LOCALE_SOURCE_STORAGE_KEY, "explicit");
  writeCookie(I18N_LOCALE_UPDATED_AT_STORAGE_KEY, updatedAt);
  writeCookie(legacyExplicitPreferenceMarkerKey, "1");
}

export function markExplicitLocalePendingSync(locale: AppLocale) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      I18N_LOCALE_PENDING_SYNC_STORAGE_KEY,
      JSON.stringify({ locale, updatedAt: new Date().toISOString() }),
    );
  } catch {
    // sessionStorage may be unavailable in private browsing.
  }
}

export function hasPendingExplicitLocaleSync(locale: AppLocale) {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.sessionStorage.getItem(I18N_LOCALE_PENDING_SYNC_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { locale?: unknown };
    return parsed.locale === locale;
  } catch {
    return false;
  }
}

export function clearPendingExplicitLocaleSync(locale?: AppLocale) {
  if (typeof window === "undefined") return;
  try {
    if (locale && !hasPendingExplicitLocaleSync(locale)) return;
    window.sessionStorage.removeItem(I18N_LOCALE_PENDING_SYNC_STORAGE_KEY);
  } catch {
    // sessionStorage may be unavailable in private browsing.
  }
}

type LocaleMessages = Partial<Record<string, string>>;

const loadedMessages: Partial<Record<AppLocale, LocaleMessages>> = {
  en: shellMessages.en,
  "zh-CN": shellMessages["zh-CN"],
  "zh-TW": shellMessages["zh-TW"],
  ja: shellMessages.ja,
  fr: shellMessages.fr,
  de: shellMessages.de,
};
const fullLocaleMessagePromises = new Map<AppLocale, Promise<LocaleMessages>>();

export const messages = loadedMessages as Record<AppLocale, LocaleMessages>;
export type TranslationKey = string;

type TranslationValues = Record<string, string | number | null | undefined>;

function shellMessagesForLocale(locale: AppLocale): LocaleMessages {
  return shellMessages[locale] ?? shellMessages[FALLBACK_LOCALE] ?? {};
}

function getLocaleMessages(locale: AppLocale): LocaleMessages {
  return loadedMessages[locale] ?? shellMessagesForLocale(locale);
}

async function importFullLocaleMessages(locale: AppLocale): Promise<LocaleMessages> {
  switch (locale) {
    case "zh-CN":
      return (await import("@/lib/locales/app/zh-CN")).zhCNMessages;
    case "zh-TW":
      return (await import("@/lib/locales/app/zh-TW")).zhTWMessages;
    case "ja":
      return (await import("@/lib/locales/app/ja")).jaMessages;
    case "fr":
      return (await import("@/lib/locales/app/fr")).frMessages;
    case "de":
      return (await import("@/lib/locales/app/de")).deMessages;
    case "en":
    default:
      return (await import("@/lib/locales/app/en")).enMessages;
  }
}

export function ensureLocaleMessages(locale: AppLocale): Promise<LocaleMessages> {
  if (fullLocaleMessagePromises.has(locale)) return fullLocaleMessagePromises.get(locale)!;

  const promise = importFullLocaleMessages(locale).then((fullMessages) => {
    const merged = { ...shellMessagesForLocale(locale), ...fullMessages };
    loadedMessages[locale] = merged;
    return merged;
  });
  fullLocaleMessagePromises.set(locale, promise);
  return promise;
}

function applyTranslationValues(template: string, values?: TranslationValues) {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_match: string, token: string) => {
    const value = values[token];
    return value == null ? "" : String(value);
  });
}

function translateFromMessages(
  localeMessages: LocaleMessages,
  key: TranslationKey,
  values?: TranslationValues,
) {
  const fallbackMessages = getLocaleMessages(FALLBACK_LOCALE);
  const template = localeMessages[key] ?? fallbackMessages[key] ?? key;
  return applyTranslationValues(template, values);
}

type I18nContextValue = {
  locale: AppLocale;
  hasExplicitPreference: boolean;
  setLocale: (
    locale: AppLocale,
    options?: { explicit?: boolean; markPendingSync?: boolean },
  ) => void;
  t: (key: TranslationKey, values?: TranslationValues) => string;
  formatNumber: (value: number) => string;
  formatDate: (value: string | number | Date) => string;
  formatDateTime: (value: string | number | Date) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function parseSupportedLocale(value?: string | null): AppLocale | null {
  if (!value) return null;
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
  if (
    normalized === "zh" ||
    normalized === "zh-cn" ||
    normalized === "zh-hans" ||
    normalized.startsWith("zh-hans-")
  ) {
    return "zh-CN";
  }
  if (normalized.startsWith("ja")) return "ja";
  if (normalized.startsWith("fr")) return "fr";
  if (normalized.startsWith("de")) return "de";
  if (normalized.startsWith("en")) return "en";
  return null;
}

export function normalizeLocale(value?: string | null): AppLocale {
  return parseSupportedLocale(value) ?? FALLBACK_LOCALE;
}

export function localeFromLanguagePreference(value?: string | null): AppLocale {
  if (!value) return DEFAULT_LOCALE;
  const languageTags = value
    .split(",")
    .map((entry) => entry.trim().split(";")[0])
    .filter(Boolean);
  for (const languageTag of languageTags) {
    const locale = parseSupportedLocale(languageTag);
    if (locale) return locale;
  }
  return FALLBACK_LOCALE;
}

export function getDeviceLocale(): AppLocale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const languages =
    Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language];
  return localeFromLanguagePreference(languages.filter(Boolean).join(","));
}

export function getStoredLocalePreference(): AppLocale | null {
  if (typeof window === "undefined") return null;
  if (readStoredLocaleSource() !== "explicit") return null;
  try {
    const stored = window.localStorage.getItem(I18N_STORAGE_KEY);
    if (stored) return normalizeLocale(stored);
  } catch {
    // localStorage may be unavailable in private browsing.
  }
  return readLocaleCookie(window.document.cookie);
}

export function hasStoredLocalePreference(): boolean {
  return readStoredLocaleSource() === "explicit" && getStoredLocalePreference() !== null;
}

export function getStoredLocalePreferenceUpdatedAt(): string | null {
  if (typeof window === "undefined") return null;
  if (readStoredLocaleSource() !== "explicit") return null;
  try {
    const stored = window.localStorage.getItem(I18N_LOCALE_UPDATED_AT_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // localStorage may be unavailable in private browsing.
  }
  return readCookieValue(window.document.cookie, I18N_LOCALE_UPDATED_AT_STORAGE_KEY);
}

export function getInitialLocale(): AppLocale {
  return getStoredLocalePreference() ?? getDeviceLocale() ?? DEFAULT_LOCALE;
}

export function localeToIntl(locale: AppLocale) {
  return intlLocaleMap[locale];
}

export function localeToOg(locale: AppLocale) {
  return ogLocaleMap[locale];
}

export function translate(locale: AppLocale, key: TranslationKey, values?: TranslationValues) {
  return translateFromMessages(getLocaleMessages(locale), key, values);
}

export function parseTranslatedStringArray(raw: string, fallback: readonly string[] = []) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...fallback];

    const values = parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);

    return values.length ? values : [...fallback];
  } catch {
    return [...fallback];
  }
}

export function I18nProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: ReactNode;
  initialLocale?: AppLocale;
}) {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);
  const [activeMessages, setActiveMessages] = useState<LocaleMessages>(() => getLocaleMessages(initialLocale));
  const [hasExplicitPreference, setHasExplicitPreference] = useState(false);

  useEffect(() => {
    setHasExplicitPreference(hasStoredLocalePreference());
    const initial = getInitialLocale();
    setLocaleState((current) => (initial === current ? current : initial));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setActiveMessages(getLocaleMessages(locale));
    void ensureLocaleMessages(locale).then((nextMessages) => {
      if (!cancelled) setActiveMessages(nextMessages);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  useEffect(() => {
    if (hasExplicitPreference) {
      const storedLocale = getStoredLocalePreference();
      const storedLocaleUpdatedAt = getStoredLocalePreferenceUpdatedAt();
      if (storedLocale === locale && storedLocaleUpdatedAt) {
        persistExplicitLocalePreference(locale, storedLocaleUpdatedAt);
      }
    }
    document.documentElement.lang = locale;
  }, [hasExplicitPreference, locale]);

  const setLocale = useCallback(
    (nextLocale: AppLocale, options?: { explicit?: boolean; markPendingSync?: boolean }) => {
      if (options?.explicit) {
        persistExplicitLocalePreference(nextLocale);
        if (options.markPendingSync !== false) {
          markExplicitLocalePendingSync(nextLocale);
        }
        setHasExplicitPreference(true);
      }
      setLocaleState(nextLocale);
    },
    [],
  );

  const value = useMemo<I18nContextValue>(() => {
    const intlLocale = localeToIntl(locale);
    return {
      locale,
      hasExplicitPreference,
      setLocale,
      t: (key, values) => translateFromMessages(activeMessages, key, values),
      formatNumber: (number) => new Intl.NumberFormat(intlLocale).format(number),
      formatDate: (value) => new Date(value).toLocaleDateString(intlLocale),
      formatDateTime: (value) =>
        new Date(value).toLocaleString(intlLocale, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
    };
  }, [activeMessages, hasExplicitPreference, locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}

export function styleLabelKey(styleId: string): TranslationKey {
  return `studio.style.${styleId}` as TranslationKey;
}

export function filterLabelKey(filterId: string): TranslationKey {
  return `studio.filter.${filterId}` as TranslationKey;
}
