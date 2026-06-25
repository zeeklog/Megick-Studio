import type { TranslationKey } from "@/lib/i18n";
import {
  isInsufficientCreditsError,
  isAdvancedAccessRequiredError,
} from "./utils";

type Translate = (key: TranslationKey) => string;

const STUDIO_GENERATION_ERROR_MESSAGE_KEYS = [
  ["GENERATION_SERVICE_BUSY", "studio.generationServiceBusy"],
  ["VIDEO_REFERENCE_REQUIRED", "studio.videoReferenceRequired"],
  ["VIDEO_MODEL_DOES_NOT_SUPPORT_REFERENCES", "studio.videoModelNoReferences"],
  ["TOO_MANY_VIDEO_REFERENCES", "studio.videoReferenceTooMany"],
  ["REFERENCE_IMAGE_REQUIRED", "studio.referenceImageRequired"],
  ["MODEL_DOES_NOT_SUPPORT_REFERENCE_IMAGES", "studio.modelNoReferenceImages"],
  ["TOO_MANY_REFERENCE_IMAGES", "studio.referenceImageTooMany"],
  ["GENERATION_SAFETY_BLOCKED", "studio.generationSafetyBlocked"],
  ["REFERENCE_IMAGE_PRIVACY_BLOCKED", "studio.referenceImagePrivacyBlocked"],
] as const satisfies ReadonlyArray<readonly [string, TranslationKey]>;

const LEGACY_GENERATION_SERVICE_BUSY_MESSAGES = new Set([
  "当前服务负载较高，请稍后再试。",
  "目前服務負載較高，請稍後再試。",
  "The generation service is under heavy load. Please try again later.",
  "現在サービスの負荷が高くなっています。後でもう一度お試しください。",
  "Le service de génération est fortement sollicité. Veuillez réessayer plus tard.",
  "Der Generierungsdienst ist derzeit stark ausgelastet. Bitte versuchen Sie es später erneut.",
]);

const STUDIO_GENERATION_ERROR_DESCRIPTION_KEYS = [
  ["GENERATION_SAFETY_BLOCKED", "studio.generationSafetyBlockedDesc"],
  ["REFERENCE_IMAGE_PRIVACY_BLOCKED", "studio.referenceImagePrivacyBlockedDesc"],
] as const satisfies ReadonlyArray<readonly [string, TranslationKey]>;

export type StudioGenerationErrorNotice = {
  title: string;
  description?: string;
  message: string;
  advancedAccessRequired: boolean;
  insufficientCredits: boolean;
  safetyBlocked: boolean;
};

function studioGenerationErrorMessageKey(value: string | null | undefined) {
  const message = value?.trim();
  if (!message) return null;
  if (LEGACY_GENERATION_SERVICE_BUSY_MESSAGES.has(message)) {
    return "studio.generationServiceBusy";
  }
  const codeMessage = message.toUpperCase();
  return STUDIO_GENERATION_ERROR_MESSAGE_KEYS.find(([code]) =>
    codeMessage === code
  )?.[1] ?? null;
}

function studioGenerationErrorDescriptionKey(value: string | null | undefined) {
  const message = value?.trim().toUpperCase();
  if (!message) return null;
  return STUDIO_GENERATION_ERROR_DESCRIPTION_KEYS.find(([code]) =>
    message === code
  )?.[1] ?? null;
}

export function studioGenerationErrorNotice(input: {
  rawMessage: string | null | undefined;
  t: Translate;
}): StudioGenerationErrorNotice {
  const { rawMessage, t } = input;
  const insufficientCredits = isInsufficientCreditsError(rawMessage);
  const advancedAccessRequired = isAdvancedAccessRequiredError(rawMessage);
  const normalizedMessage = rawMessage?.trim().toUpperCase();
  const safetyBlocked =
    normalizedMessage === "GENERATION_SAFETY_BLOCKED" ||
    normalizedMessage === "REFERENCE_IMAGE_PRIVACY_BLOCKED";

  if (insufficientCredits) {
    const message = t("studio.insufficientCredits");
    return {
      title: message,
      description: t("studio.insufficientCreditsDesc"),
      message,
      advancedAccessRequired,
      insufficientCredits,
      safetyBlocked,
    };
  }

  if (advancedAccessRequired) {
    const message = t("studio.advancedAccessRequired");
    return {
      title: message,
      description: t("studio.advancedAccessRequiredDesc"),
      message,
      advancedAccessRequired,
      insufficientCredits,
      safetyBlocked,
    };
  }

  const messageKey = studioGenerationErrorMessageKey(rawMessage);
  if (messageKey) {
    const message = t(messageKey);
    const descriptionKey = studioGenerationErrorDescriptionKey(rawMessage);
    return {
      title: message,
      description: descriptionKey ? t(descriptionKey) : undefined,
      message,
      advancedAccessRequired,
      insufficientCredits,
      safetyBlocked,
    };
  }

  const message = rawMessage?.trim() || t("studio.generationFailed");
  return {
    title: t("studio.failed"),
    description: message,
    message,
    advancedAccessRequired,
    insufficientCredits,
    safetyBlocked,
  };
}
