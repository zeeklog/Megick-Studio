import type { Logger } from "@nestjs/common";

export const GENERATION_SERVICE_BUSY_ERROR = "GENERATION_SERVICE_BUSY";
export const DEFAULT_PUBLIC_GENERATION_ERROR = GENERATION_SERVICE_BUSY_ERROR;

type ErrorLogger = Pick<Logger, "error" | "debug">;

const PUBLIC_GENERATION_ERROR_CODES = new Set([
  GENERATION_SERVICE_BUSY_ERROR,
  "INSUFFICIENT_CREDITS",
  "ADVANCED_ACCESS_REQUIRED",
  "PAID_MODEL_REQUIRED",
  "VIDEO_REFERENCE_REQUIRED",
  "VIDEO_MODEL_DOES_NOT_SUPPORT_REFERENCES",
  "TOO_MANY_VIDEO_REFERENCES",
  "REFERENCE_IMAGE_REQUIRED",
  "MODEL_DOES_NOT_SUPPORT_REFERENCE_IMAGES",
  "TOO_MANY_REFERENCE_IMAGES",
  "GENERATION_SAFETY_BLOCKED",
  "REFERENCE_IMAGE_PRIVACY_BLOCKED",
] as const);

export type PublicGenerationErrorCode =
  typeof PUBLIC_GENERATION_ERROR_CODES extends Set<infer T> ? T : never;

const LEGACY_PUBLIC_GENERATION_FALLBACK_MESSAGES = new Set([
  "当前服务负载较高，请稍后再试。",
  "目前服務負載較高，請稍後再試。",
  "The generation service is under heavy load. Please try again later.",
  "現在サービスの負荷が高くなっています。後でもう一度お試しください。",
  "Le service de génération est fortement sollicité. Veuillez réessayer plus tard.",
  "Der Generierungsdienst ist derzeit stark ausgelastet. Bitte versuchen Sie es später erneut.",
]);

function directPublicGenerationErrorCode(message: string) {
  const normalizedMessage = message.trim().toUpperCase();
  return PUBLIC_GENERATION_ERROR_CODES.has(
    normalizedMessage as typeof PUBLIC_GENERATION_ERROR_CODES extends Set<infer T> ? T : never,
  )
    ? normalizedMessage
    : null;
}

function legacyPublicGenerationFallbackMessage(message: string) {
  return LEGACY_PUBLIC_GENERATION_FALLBACK_MESSAGES.has(message.trim())
    ? GENERATION_SERVICE_BUSY_ERROR
    : null;
}

function providerStatusFromRawMessage(message: string) {
  const jsonStatusMatch = message.match(/\\"status\\"\s*:\s*\\"([^"\\]+)\\"/i);
  if (jsonStatusMatch?.[1]) return jsonStatusMatch[1].trim();
  const statusMatch = message.match(/status\s+["']([^"']+)["']/i);
  if (statusMatch?.[1]) return statusMatch[1].trim();
  return null;
}

function providerCodeFromRawMessage(message: string) {
  const jsonCodeMatch = message.match(/\\"code\\"\s*:\s*\\"([^"\\]+)\\"/i);
  if (jsonCodeMatch?.[1]) return jsonCodeMatch[1].trim();
  const codeMatch = message.match(/["']?code["']?\s*:\s*["']([^"']+)["']/i);
  if (codeMatch?.[1]) return codeMatch[1].trim();
  return null;
}

export function classifyPublicGenerationError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const direct = directPublicGenerationErrorCode(message);
  if (direct) return direct;
  const legacyFallback = legacyPublicGenerationFallbackMessage(message);
  if (legacyFallback) return legacyFallback;
  const providerStatus = providerStatusFromRawMessage(message);
  if (providerStatus === "Request Moderated") {
    return "GENERATION_SAFETY_BLOCKED";
  }
  const providerCode = providerCodeFromRawMessage(message);
  if (
    providerCode?.startsWith("InputImageSensitiveContentDetected.") ||
    providerCode === "InputImageSensitiveContentDetected" ||
    /InputImageSensitiveContentDetected/i.test(message) ||
    /input image may contain real person/i.test(message)
  ) {
    return "REFERENCE_IMAGE_PRIVACY_BLOCKED";
  }
  return null;
}

function stringifyUnknownError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function publicGenerationErrorMessage(
  error: unknown,
  fallback: string | null = DEFAULT_PUBLIC_GENERATION_ERROR,
) {
  const code = classifyPublicGenerationError(error);
  if (code) return code;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return message.trim() ? DEFAULT_PUBLIC_GENERATION_ERROR : fallback;
}

export function loggedPublicGenerationErrorMessage(
  error: unknown,
  logger: ErrorLogger,
  context: string,
  fallback: string | null = DEFAULT_PUBLIC_GENERATION_ERROR,
) {
  const publicMessage = publicGenerationErrorMessage(error, fallback);
  logPublicGenerationErrorResponse(logger, context, publicMessage, error);
  return publicMessage;
}

export function logPublicGenerationErrorResponse(
  logger: ErrorLogger,
  context: string,
  publicMessage: unknown,
  sourceError?: unknown,
) {
  if (publicMessage !== DEFAULT_PUBLIC_GENERATION_ERROR) return;
  const source =
    sourceError === undefined
      ? ""
      : ` from ${generationErrorLogMessage(sourceError)}`;
  const logMessage = `${context}: returning public generation error "${DEFAULT_PUBLIC_GENERATION_ERROR}"${source}`;
  const stack =
    sourceError === undefined ? undefined : generationErrorLogStack(sourceError);
  if (stack) {
    logger.debug(logMessage, stack);
    return;
  }
  logger.debug(logMessage);
}

export function generationErrorLogMessage(error: unknown) {
  const message = stringifyUnknownError(error);
  const cause =
    error instanceof Error
      ? (error as Error & { cause?: unknown }).cause
      : undefined;
  return cause
    ? `${message}; cause=${stringifyUnknownError(cause)}`
    : message;
}

export function generationErrorLogStack(error: unknown) {
  return error instanceof Error ? error.stack : undefined;
}
