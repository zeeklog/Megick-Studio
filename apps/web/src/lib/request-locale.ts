import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequest } from "@tanstack/react-start/server";
import {
  DEFAULT_LOCALE,
  I18N_LOCALE_SOURCE_STORAGE_KEY,
  I18N_STORAGE_KEY,
  localeFromLanguagePreference,
  normalizeLocale,
} from "./i18n";

export const getRequestLocale = createServerFn({ method: "GET" }).handler(async () => {
  const cookieLocale = getCookie(I18N_STORAGE_KEY);
  const hasExplicitCookieLocale =
    getCookie(I18N_LOCALE_SOURCE_STORAGE_KEY) === "explicit" ||
    getCookie(`${I18N_STORAGE_KEY}.explicit`) === "1";
  if (hasExplicitCookieLocale && cookieLocale) return normalizeLocale(cookieLocale);
  return localeFromLanguagePreference(getRequest().headers.get("accept-language")) ?? DEFAULT_LOCALE;
});
