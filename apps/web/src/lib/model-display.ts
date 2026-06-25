import type { AIModelPublic } from "@megick/api-types";
import type { AppLocale } from "@/lib/i18n";

type LocalizedModelName = Pick<AIModelPublic, "code" | "displayName" | "displayNameEn">;

export function isChineseLocale(locale: AppLocale) {
  return locale === "zh-CN" || locale === "zh-TW";
}

export function modelDisplayName(model: LocalizedModelName, locale: AppLocale) {
  if (isChineseLocale(locale)) return model.displayName || model.displayNameEn || model.code;
  return model.displayNameEn || model.displayName || model.code;
}
