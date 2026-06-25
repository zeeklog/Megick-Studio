import type { TranslationKey } from "@/lib/i18n";

export const DEFAULT_CHAT_TITLE = "New chat";

const DEFAULT_CHAT_TITLES = new Set([
  DEFAULT_CHAT_TITLE,
  "新对话",
  "新聊天",
  "新しいチャット",
  "Neuer Chat",
  "Nouveau chat",
]);

type Translate = (key: TranslationKey) => string;

export function isDefaultChatTitle(title: string | null | undefined) {
  const normalized = title?.trim();
  return !normalized || DEFAULT_CHAT_TITLES.has(normalized);
}

export function displayChatTitle(title: string | null | undefined, t: Translate): string {
  const normalized = title?.trim();
  if (!normalized || DEFAULT_CHAT_TITLES.has(normalized)) return t("studio.newChat");
  return normalized;
}

export function persistedChatTitle(title: string | null | undefined) {
  const normalized = title?.trim();
  return isDefaultChatTitle(normalized) ? DEFAULT_CHAT_TITLE : normalized;
}
