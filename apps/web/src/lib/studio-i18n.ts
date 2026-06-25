import type { AIImageEditModePublic } from "@megick/api-types";
import type { TranslationKey } from "@/lib/i18n";

type Translator = (key: TranslationKey) => string;

const AI_IMAGE_EDIT_MODE_KEYS: Record<string, TranslationKey> = {
  "smart-erase": "studio.aiEdit.mode.smartErase",
  "local-replace": "studio.aiEdit.mode.localReplace",
  outpaint: "studio.aiEdit.mode.outpaint",
  "text-edit": "studio.aiEdit.mode.textEdit",
};

const CHINESE_AI_IMAGE_EDIT_MODE_NAMES = new Set([
  "智能擦除",
  "局部替换",
  "扩图",
  "純文字描述改圖",
  "纯文本描述改图",
  "文本改图",
]);

function cleanName(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function localizedImageEditModeName(
  mode: Pick<AIImageEditModePublic, "code" | "name">,
  t: Translator,
) {
  const key = AI_IMAGE_EDIT_MODE_KEYS[mode.code];
  if (key) return t(key);
  return cleanName(mode.name) || t("studio.aiEdit.mode.default");
}

export function localizedImageEditModeLabelFromParams(
  params: Record<string, unknown> | undefined,
  fallback: string | null | undefined,
  t: Translator,
) {
  const modeCode = cleanName(params?.modeCode);
  const modeKey = modeCode ? AI_IMAGE_EDIT_MODE_KEYS[modeCode] : undefined;
  if (modeKey) return t(modeKey);

  const modeName = cleanName(params?.modeName);
  if (modeName && !CHINESE_AI_IMAGE_EDIT_MODE_NAMES.has(modeName)) return modeName;
  return cleanName(fallback) || null;
}
