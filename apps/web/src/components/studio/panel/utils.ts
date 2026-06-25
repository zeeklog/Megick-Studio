import type {
  AIModelPublic,
  GenerationJobPublic,
  PromptTemplatePublic,
  VideoModelInputMode,
} from "@megick/api-types";
import { RATIO_PRESETS } from "@/components/studio/presets";
import type { TranslationKey } from "@/lib/i18n";
import {
  clampStudioVideoDuration,
  defaultStudioSettings,
  newStudioId,
  type StudioMode,
  type StudioResult,
  type StudioSettings,
} from "@/routes/-dashboard-types";
import type { StudioSearch } from "@/routes/-studio-search";
import {
  MAX_STUDIO_REFERENCE_IMAGES,
  STUDIO_HANDOFF_PREFIX,
  VIDEO_INPUT_MODES,
  VIDEO_REFERENCE_MAX_SECONDS,
  VIDEO_REFERENCE_MIN_SECONDS,
} from "./constants";
import type {
  ConcreteVideoInputMode,
  StudioHandoff,
  StudioMediaReference,
  StudioReferenceKind,
  StudioVideoMediaType,
  VideoModeDraft,
  VideoModeDrafts,
} from "./types";

export function isNewSessionSearch(value: StudioSearch["newSession"]) {
  return value === true || value === "true" || value === "1";
}

export function isTruthySearchFlag(value: boolean | string | undefined) {
  return value === true || value === "true" || value === "1";
}

export function isInsufficientCreditsError(value: string | null | undefined) {
  const message = value?.trim().toUpperCase();
  return message === "INSUFFICIENT_CREDITS";
}

export function isAdvancedAccessRequiredError(value: string | null | undefined) {
  const message = value?.trim().toUpperCase();
  return message === "ADVANCED_ACCESS_REQUIRED" || message === "PAID_MODEL_REQUIRED";
}

export function referenceBoundsForModel(mode: StudioMode, model: AIModelPublic | null | undefined) {
  if (mode === "image") {
    const supportsReferenceImages = Boolean(model?.supportsReferenceImages);
    const requiresReferenceImages =
      supportsReferenceImages && Boolean(model?.requiresReferenceImages);
    return {
      supportsReferenceImages,
      requiresReferenceImages,
      minReferenceImages: requiresReferenceImages
        ? Math.max(model?.minReferenceImages ?? 1, 1)
        : 0,
      maxReferenceImages: supportsReferenceImages
        ? Math.max(model?.maxReferenceImages ?? MAX_STUDIO_REFERENCE_IMAGES, 1)
        : 0,
    };
  }

  return {
    supportsReferenceImages: Boolean(model?.supportsReferenceImages),
    requiresReferenceImages: Boolean(model?.requiresReferenceImages),
    minReferenceImages: Math.max(model?.minReferenceImages ?? 0, 0),
    maxReferenceImages: Math.max(model?.maxReferenceImages ?? 0, 0),
  };
}

export function normalizeVideoMode(value: unknown): VideoModelInputMode {
  return value === "T2V" || value === "I2V" || value === "R2V" || value === "EDIT" ? value : "T2V";
}

export function modelCreditLabel(
  model: Pick<AIModelPublic, "category" | "costCredits">,
  t: (key: TranslationKey, values?: Record<string, string | number | null | undefined>) => string,
  formatNumber: (value: number) => string,
) {
  if (model.category === "IMAGE2VIDEO") {
    return t("studio.creditsPerSecond", {
      credits: formatNumber(model.costCredits),
    });
  }
  return t("studio.creditsPerGeneration", {
    credits: formatNumber(model.costCredits),
  });
}

export function estimatedGenerationCredits(
  model: Pick<AIModelPublic, "category" | "costCredits"> | null | undefined,
  durationSeconds: number,
) {
  if (!model) return 0;
  return model.category === "IMAGE2VIDEO" ? model.costCredits * durationSeconds : model.costCredits;
}

export function defaultVideoModeForModels(models: AIModelPublic[]) {
  const explicitDefault = models.find(
    (model) => model.isDefault && model.videoInputMode,
  )?.videoInputMode;
  if (explicitDefault) return normalizeVideoMode(explicitDefault);
  const firstMode = models.find((model) => model.videoInputMode)?.videoInputMode;
  return firstMode ? normalizeVideoMode(firstMode) : "T2V";
}

export function mediaKindFromUrl(url: string): StudioReferenceKind {
  return /\.(mp4|m4v|mov|webm)(\?|#|$)/i.test(url) ? "video" : "image";
}

export function referenceKindFromFile(file: File): StudioReferenceKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/") || /\.(mp4|mov)$/i.test(file.name)) return "video";
  return null;
}

export function extensionFromName(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function referenceMediaTypeFor(
  mode: VideoModelInputMode | null | undefined,
  kind: StudioReferenceKind,
  index: number,
): StudioVideoMediaType {
  const normalizedMode = normalizeVideoMode(mode);
  if (normalizedMode === "I2V") return kind === "video" ? "first_clip" : "first_frame";
  if (normalizedMode === "EDIT") {
    return kind === "video" && index === 0
      ? "video"
      : kind === "video"
        ? "reference_video"
        : "reference_image";
  }
  if (normalizedMode === "R2V") return kind === "video" ? "reference_video" : "reference_image";
  return kind === "video" ? "reference_video" : "reference_image";
}

export function withVideoReferenceTypes(
  refs: StudioMediaReference[],
  mode: VideoModelInputMode | null | undefined,
) {
  const normalizedMode = normalizeVideoMode(mode);
  let editSourceVideoAssigned = false;
  return refs.map((ref, index) => {
    const kind = ref.kind ?? mediaKindFromUrl(ref.src);
    if (normalizedMode === "EDIT" && kind === "video") {
      const mediaType: StudioVideoMediaType = editSourceVideoAssigned ? "reference_video" : "video";
      editSourceVideoAssigned = true;
      return {
        ...ref,
        kind,
        mediaType,
      };
    }
    return {
      ...ref,
      kind,
      mediaType: ref.mediaType ?? referenceMediaTypeFor(normalizedMode, kind, index),
    };
  });
}

export function videoModeLabelKey(mode: VideoModelInputMode): TranslationKey {
  switch (mode) {
    case "I2V":
      return "studio.videoMode.i2v";
    case "R2V":
      return "studio.videoMode.r2v";
    case "EDIT":
      return "studio.videoMode.edit";
    case "T2V":
    default:
      return "studio.videoMode.t2v";
  }
}

export function videoModeDescriptionKey(mode: VideoModelInputMode): TranslationKey {
  switch (mode) {
    case "I2V":
      return "studio.videoModeDescription.i2v";
    case "R2V":
      return "studio.videoModeDescription.r2v";
    case "EDIT":
      return "studio.videoModeDescription.edit";
    case "T2V":
    default:
      return "studio.videoModeDescription.t2v";
  }
}

export function defaultVideoSettingsForMode(
  mode: ConcreteVideoInputMode,
  override?: Partial<StudioSettings>,
) {
  return defaultStudioSettings({
    ...override,
    mode: "video",
    style: "none",
    ratio: override?.ratio ?? "16:9",
    resolution: override?.resolution === "1080P" ? "1080P" : "720P",
    model: override?.model ?? "",
    videoInputMode: mode,
  });
}

export function createDefaultVideoDrafts(base?: Partial<StudioSettings>): VideoModeDrafts {
  return VIDEO_INPUT_MODES.reduce((drafts, mode) => {
    drafts[mode] = {
      prompt: "",
      refs: [],
      settings: defaultVideoSettingsForMode(mode, base),
      referenceUrlInput: "",
    };
    return drafts;
  }, {} as VideoModeDrafts);
}

export function normalizeVideoDraft(
  mode: ConcreteVideoInputMode,
  draft: VideoModeDraft,
): VideoModeDraft {
  return {
    prompt: draft.prompt,
    refs: withVideoReferenceTypes(draft.refs, mode),
    settings: defaultVideoSettingsForMode(mode, draft.settings),
    referenceUrlInput: draft.referenceUrlInput,
  };
}

export function handoffReferenceName(
  mode: StudioMode,
  t: (key: TranslationKey, values?: Record<string, string | number | null | undefined>) => string,
) {
  return mode === "video" ? t("studio.videoReference") : t("studio.reference");
}

export function asPlainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function numericParam(value: unknown) {
  const numeric =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : undefined;
}

export function stringParam(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function stringArrayParam(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function stringArraySlotsParam(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : ""));
}

export function ratioFromJobParams(params: Record<string, unknown>, fallback: string) {
  const explicit = stringParam(params.ratio) ?? stringParam(params.aspect_ratio);
  if (explicit) return explicit;
  const size = stringParam(params.size);
  return RATIO_PRESETS.find((preset) => preset.size === size)?.id ?? fallback;
}

type JobReferenceParam = { src: string; mediaId?: string; mediaType?: StudioVideoMediaType };

export function refsFromGenerationJobParams(
  job: GenerationJobPublic,
  mode: StudioMode,
  referenceName: string,
): StudioMediaReference[] {
  const params = asPlainRecord(job.params);
  const media: JobReferenceParam[] = Array.isArray(params.media)
    ? params.media.flatMap((item): JobReferenceParam[] => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const record = item as Record<string, unknown>;
        const src = stringParam(record.url) ?? stringParam(record.src);
        if (!src) return [];
        const mediaType =
          typeof record.type === "string" ? (record.type as StudioVideoMediaType) : undefined;
        const mediaId = stringParam(record.mediaId);
        return [{ src, ...(mediaId ? { mediaId } : {}), ...(mediaType ? { mediaType } : {}) }];
      })
    : [];
  const referenceImageUrls = stringArrayParam(params.reference_images);
  const referenceMediaIds = stringArraySlotsParam(params.reference_media_ids);
  const referenceMediaIdsCamel = stringArraySlotsParam(params.referenceMediaIds);
  const urls: JobReferenceParam[] =
    mode === "video"
      ? [
          ...media,
          ...stringArrayParam(params.imageUrls).map((src): JobReferenceParam => ({ src })),
          ...stringArrayParam(params.videoUrls).map((src): JobReferenceParam => ({ src })),
          ...stringArrayParam(params.reference_images).map((src): JobReferenceParam => ({ src })),
          ...stringArrayParam(params.referenceImages).map((src): JobReferenceParam => ({ src })),
          ...stringArrayParam(params.reference_videos).map((src): JobReferenceParam => ({ src })),
          ...stringArrayParam(params.referenceVideos).map((src): JobReferenceParam => ({ src })),
        ]
      : [
          ...referenceImageUrls.map((src, index): JobReferenceParam => ({
            src,
            ...(referenceMediaIds[index] ? { mediaId: referenceMediaIds[index] } : {}),
          })),
          ...stringArrayParam(params.referenceImages).map((src, index): JobReferenceParam => ({
            src,
            ...(referenceMediaIdsCamel[index] ? { mediaId: referenceMediaIdsCamel[index] } : {}),
          })),
          ...(stringParam(params.reference_image)
            ? [{ src: stringParam(params.reference_image)! }]
            : []),
          ...(stringParam(params.referenceImage)
            ? [{ src: stringParam(params.referenceImage)! }]
            : []),
        ];
  const seen = new Set<string>();
  return urls
    .filter((item) => {
      const key = item.mediaId ?? item.src;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item, index) => {
      const kind = mediaKindFromUrl(item.src);
      return {
        id: newStudioId(),
        src: item.src,
        name: referenceName,
        mediaId: item.mediaId,
        kind,
        mediaType:
          mode === "video"
            ? (item.mediaType ??
              referenceMediaTypeFor(normalizeVideoMode(params.videoInputMode), kind, index))
            : undefined,
      };
    });
}

export function settingsPatchFromGenerationJob(
  job: GenerationJobPublic,
  mode: StudioMode,
): Partial<StudioSettings> {
  const params = asPlainRecord(job.params);
  const videoInputMode = normalizeVideoMode(params.videoInputMode);
  return {
    mode,
    model: job.modelCode,
    style: "none",
    ratio: ratioFromJobParams(params, mode === "video" ? "16:9" : "1:1"),
    count: Math.min(
      Math.max(Math.round(numericParam(params.n) ?? numericParam(params.count) ?? 1), 1),
      4,
    ),
    seed: null,
    negative: "",
    duration: clampStudioVideoDuration(params.duration ?? params.seconds),
    resolution: params.resolution === "1080P" ? "1080P" : "720P",
    videoInputMode: mode === "video" ? videoInputMode : null,
  };
}

export function apiErrorStatus(value: unknown) {
  if (!value || typeof value !== "object" || !("status" in value)) return null;
  const status = (value as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

export function isImageReferenceUrl(url: string | null | undefined) {
  if (!url) return false;
  return /^data:image\//i.test(url) || !/\.(mp4|m4v|mov|webm)(\?|#|$)/i.test(url);
}

export function normalizeReferenceInput(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  if (/^(https?:\/\/|data:image\/|\/api\/oss\/(?:sign|assets\/content))/i.test(raw)) return raw;
  return /^(generations|showcase|studio-edits|templates)\//.test(raw)
    ? `/api/oss/sign?key=${encodeURIComponent(raw)}`
    : "";
}

export function imageExtension(type: string | undefined) {
  const lower = type?.toLowerCase() ?? "";
  if (lower.includes("jpeg")) return "jpg";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("png")) return "png";
  if (lower.includes("mp4")) return "mp4";
  if (lower.includes("quicktime")) return "mov";
  if (lower.includes("webm")) return "webm";
  return "jpg";
}

export function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Invalid image data"));
    reader.onerror = () => reject(new Error("Image failed to load"));
    reader.readAsDataURL(blob);
  });
}

export function loadBrowserImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image failed to load"));
    image.src = src;
  });
}

export function templateReferenceUrls(template: PromptTemplatePublic, limit: number) {
  const urls = [...template.referenceUrls];
  if (
    template.exampleUrl &&
    isImageReferenceUrl(template.exampleUrl) &&
    !urls.includes(template.exampleUrl)
  ) {
    urls.push(template.exampleUrl);
  }
  return urls.slice(0, limit);
}

export function writeStudioHandoff(payload: StudioHandoff) {
  if (typeof window === "undefined") return null;
  const id = newStudioId();
  try {
    window.sessionStorage.setItem(`${STUDIO_HANDOFF_PREFIX}${id}`, JSON.stringify(payload));
    return id;
  } catch {
    return null;
  }
}

export function readStudioHandoff(id: string | undefined): StudioHandoff | null {
  if (!id || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`${STUDIO_HANDOFF_PREFIX}${id}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StudioHandoff>;
    window.sessionStorage.removeItem(`${STUDIO_HANDOFF_PREFIX}${id}`);
    const refs = Array.isArray(parsed.refs)
      ? parsed.refs.filter((item): item is { src: string; name?: string } =>
          Boolean(item && typeof item === "object" && typeof item.src === "string" && item.src),
        )
      : [];
    if (refs.length > 0) {
      return {
        ...parsed,
        refs,
        videoInputMode: normalizeVideoMode(parsed.videoInputMode) as ConcreteVideoInputMode,
      };
    }
    return typeof parsed.src === "string" && parsed.src
      ? {
          ...(parsed as StudioHandoff),
          videoInputMode: normalizeVideoMode(parsed.videoInputMode) as ConcreteVideoInputMode,
        }
      : null;
  } catch {
    return null;
  }
}

export function assetContentUrl(src: string | undefined) {
  const raw = src?.trim();
  if (!raw || raw.startsWith("data:") || typeof window === "undefined") return null;

  const normalizeKey = (value: string | null | undefined) => {
    const key = value?.trim().replace(/^\/+/, "").split(/[!@?]/)[0];
    if (!key || key.includes("..")) return null;
    return /^(generations|showcase|studio-edits|templates)\//.test(key) ? key : null;
  };

  try {
    const url = new URL(raw, window.location.origin);
    if (url.pathname === "/api/oss/assets/content" || url.pathname === "/api/oss/sign") {
      const key = normalizeKey(url.searchParams.get("key"));
      return key ? `/api/oss/assets/content?key=${encodeURIComponent(key)}` : null;
    }
    const key = normalizeKey(decodeURIComponent(url.pathname.replace(/^\/+/, "")));
    return key ? `/api/oss/assets/content?key=${encodeURIComponent(key)}` : null;
  } catch {
    const key = normalizeKey(raw);
    return key ? `/api/oss/assets/content?key=${encodeURIComponent(key)}` : null;
  }
}

export function jobOutputContentUrl(item: StudioResult, variant?: "thumbnail") {
  if (!item.jobId || !Number.isInteger(item.outputIndex) || (item.outputIndex ?? -1) < 0) {
    return null;
  }
  const base = `/api/generation/jobs/${encodeURIComponent(item.jobId)}/output/${item.outputIndex}/content`;
  return variant ? `${base}?variant=${variant}` : base;
}

export function referenceCandidates(item: StudioResult) {
  return [
    assetContentUrl(item.src),
    item.src,
    assetContentUrl(item.fallbackSrc),
    item.fallbackSrc,
    assetContentUrl(item.sourceSrc),
    item.sourceSrc,
    jobOutputContentUrl(item),
  ].filter((src, index, items): src is string => Boolean(src) && items.indexOf(src) === index);
}

export function downloadCandidates(item: StudioResult) {
  return [
    jobOutputContentUrl(item),
    assetContentUrl(item.src),
    item.src,
    assetContentUrl(item.fallbackSrc),
    item.fallbackSrc,
    assetContentUrl(item.sourceSrc),
    item.sourceSrc,
  ].filter((src, index, items): src is string => Boolean(src) && items.indexOf(src) === index);
}

export function mediaExtension(blob: Blob, item: StudioResult) {
  const type = blob.type.toLowerCase();
  if (item.kind === "video") {
    if (type.includes("webm")) return "webm";
    if (type.includes("quicktime")) return "mov";
    return "mp4";
  }
  if (type.includes("jpeg")) return "jpg";
  if (type.includes("webp")) return "webp";
  return "png";
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function objectUrlFromBlob(blob: Blob) {
  return URL.createObjectURL(blob);
}

export async function readImageDimensions(blob: Blob) {
  if ("createImageBitmap" in window) {
    const bitmap = await createImageBitmap(blob);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = await loadBrowserImage(url);
    return {
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function validateReferenceVideoDuration(file: File) {
  return new Promise<void>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = video.duration;
      cleanup();
      if (
        Number.isFinite(duration) &&
        duration >= VIDEO_REFERENCE_MIN_SECONDS &&
        duration <= VIDEO_REFERENCE_MAX_SECONDS
      ) {
        resolve();
      } else {
        reject(new Error("VIDEO_REFERENCE_DURATION_INVALID"));
      }
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("Video metadata failed to load"));
    };
    video.src = url;
  });
}

export function ratioParts(ratio: string) {
  const [rawW, rawH] = ratio.split(":").map((part) => Number(part));
  const w = Number.isFinite(rawW) && rawW > 0 ? rawW : 1;
  const h = Number.isFinite(rawH) && rawH > 0 ? rawH : 1;
  return { w, h, css: `${w} / ${h}`, value: w / h };
}
