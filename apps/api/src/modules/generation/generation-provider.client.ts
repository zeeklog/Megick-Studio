import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import type {
  GeneratedItem,
  VideoTaskDeleteResult,
  VideoTaskListResult,
  VideoTaskResult,
} from "./generation-provider.types";
import {
  DIRECT_TEXT2IMAGE_ORIGINS_ENV,
  parseDirectText2ImageOrigins,
  selectText2ImageAdapter,
  type Text2ImageAdapterResult,
  type Text2ImageInput,
} from "./text2image.adapters";

interface VideoGenerationInput extends Text2ImageInput {
  imageUrls?: string[];
  onProgress?: (progress: number, payload?: unknown) => Promise<void> | void;
  onProviderJobId?: (
    providerJobId: string,
    payload?: unknown,
  ) => Promise<void> | void;
}

type WanVideoMediaType =
  | "first_frame"
  | "last_frame"
  | "first_clip"
  | "reference_image"
  | "reference_video"
  | "driving_audio"
  | "video";

type WanVideoMediaItem = {
  type: WanVideoMediaType | string;
  url: string;
  reference_voice?: string;
};

function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeStatus(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return normalized || undefined;
}

function numberParam(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

function appendPath(baseUrl: string, path: string) {
  return `${normalizeBaseUrl(baseUrl)}/${path.replace(/^\/+/, "")}`;
}

function originForUrl(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

function appendV1Path(baseUrl: string, path: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  try {
    const parsed = new URL(normalized);
    if (/\/v1$/i.test(parsed.pathname.replace(/\/+$/, ""))) {
      return appendPath(normalized, path);
    }
  } catch {
    if (/\/v1$/i.test(normalized)) return appendPath(normalized, path);
  }
  return appendPath(normalized, `/v1/${path.replace(/^\/+/, "")}`);
}

function isFullChatCompletionsEndpoint(baseUrl: string) {
  return /\/chat\/completions\/?$/i.test(baseUrl.trim());
}

function resolveChatCompletionsUrl(baseUrl: string) {
  if (isFullChatCompletionsEndpoint(baseUrl)) return normalizeBaseUrl(baseUrl);

  const normalized = normalizeBaseUrl(baseUrl);
  try {
    const parsed = new URL(normalized);
    const path = parsed.pathname.replace(/\/+$/, "");
    if (!path || path === "/") {
      return appendPath(normalized, "/v1/chat/completions");
    }
  } catch {
    // Fall through to the OpenAI-compatible path append.
  }

  return appendPath(normalized, "/chat/completions");
}

function isFullVideoCreateEndpoint(baseUrl: string) {
  return /(\/video\/generations|\/videos\/generations|\/videos|\/generate|\/jobs\/createTask|fal\.run\/.+)$/i.test(
    baseUrl.trim(),
  );
}

function isNewApiVideoBaseUrl(baseUrl: string) {
  const lower = baseUrl.toLowerCase();
  return (
    /\/(?:v1\/)?videos?\/generations\/?$/i.test(lower)
  );
}

function isVolcengineVideoBaseUrl(baseUrl: string) {
  const lower = baseUrl.toLowerCase();
  return (
    lower.includes("volces.com") ||
    lower.includes("volcengine.com") ||
    lower.includes("/contents/generations/tasks")
  );
}

function isMagickApiUrl(url: string) {
  return url.toLowerCase().includes("magickapi.com");
}

function normalizeMagickApiVideoCreateUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (
      /\/(?:v1\/)?(?:video|videos)\/generations\/?$/i.test(parsed.pathname) ||
      /\/v1\/?$/i.test(parsed.pathname) ||
      parsed.pathname === "" ||
      parsed.pathname === "/"
    ) {
      parsed.pathname = "/v1/videos";
      return parsed.toString();
    }
    if (/\/v1\/videos\/?$/i.test(parsed.pathname)) return parsed.toString();
  } catch {
    // Fall through to string replacement for non-standard URLs.
  }
  if (/\/(?:v1\/)?(?:video|videos)\/generations\/?(\?.*)?$/i.test(url)) {
    return url.replace(
      /\/(?:v1\/)?(?:video|videos)\/generations\/?(\?.*)?$/i,
      (_match, suffix = "") => `/v1/videos${suffix}`,
    );
  }
  if (/\/v1\/?$/i.test(url) || isMagickApiUrl(url)) {
    return appendV1Path(url, "/videos");
  }
  return url;
}

function normalizeNewApiVideoCreateUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (/\/videos\/generations\/?$/i.test(parsed.pathname)) {
      parsed.pathname = parsed.pathname.replace(
        /\/videos\/generations\/?$/i,
        "/video/generations",
      );
      return parsed.toString();
    }
  } catch {
    // Fall through to the string replacement for non-standard URLs.
  }
  return url.replace(
    /\/videos\/generations\/?(\?.*)?$/i,
    (_match, suffix = "") => `/video/generations${suffix}`,
  );
}

function inferVideoApiStyle(
  baseUrl: string,
  params: Record<string, unknown>,
) {
  const configured = stringParam(params.apiStyle ?? params.provider);
  if (configured) {
    const normalized = configured.trim().toLowerCase();
    if (normalized === "volcengine" || normalized === "volcengine-video") {
      return "volcengine-video";
    }
  }
  const configuredEndpoint = stringParam(
    params.createUrl ?? params.endpoint ?? params.endpointPath,
  );
  if (
    isVolcengineVideoBaseUrl(baseUrl) ||
    (configuredEndpoint && isVolcengineVideoBaseUrl(configuredEndpoint))
  ) {
    return "volcengine-video";
  }
  if (
    isMagickApiUrl(baseUrl) ||
    (configuredEndpoint && isMagickApiUrl(configuredEndpoint))
  ) {
    return "magick-video";
  }
  if (
    isNewApiVideoBaseUrl(baseUrl) ||
    (configuredEndpoint && isNewApiVideoBaseUrl(configuredEndpoint))
  ) {
    return "new-api-video";
  }
  if (configured) return configured;
  const lower = baseUrl.toLowerCase();
  if (lower.includes("volces.com") || lower.includes("volcengine.com")) {
    return "volcengine-video";
  }
  if (lower.includes("dpi.crex.cn")) return "dpi-chat-completions";
  if (lower.includes("/jobs/createtask")) return "seedance-task";
  if (lower.includes("/v2") || lower.endsWith("/generate"))
    return "seedance-v2";
  if (lower.includes("fal.run")) return "fal";
  return "openai";
}

function resolveVideoCreateUrl(
  baseUrl: string,
  params: Record<string, unknown>,
  apiStyle: string,
) {
  const isVolcengineVideo =
    apiStyle === "volcengine-video" || isVolcengineVideoBaseUrl(baseUrl);
  const isMagickVideo =
    apiStyle === "magick-video" || isMagickApiUrl(baseUrl);
  const isNewApiVideo =
    apiStyle === "new-api-video" || isNewApiVideoBaseUrl(baseUrl);
  const configured = stringParam(
    params.createUrl ?? params.endpoint ?? params.endpointPath,
  );
  if (configured) {
    const url = /^https?:\/\//i.test(configured)
      ? configured
      : appendPath(baseUrl, configured);
    if (isVolcengineVideo) return normalizeVolcengineVideoTasksUrl(url);
    if (isMagickVideo || isMagickApiUrl(url)) {
      return normalizeMagickApiVideoCreateUrl(url);
    }
    return isNewApiVideo ? normalizeNewApiVideoCreateUrl(url) : url;
  }
  if (apiStyle === "dpi-chat-completions")
    return resolveChatCompletionsUrl(baseUrl);
  if (isFullVideoCreateEndpoint(baseUrl)) {
    const url = normalizeBaseUrl(baseUrl);
    if (isVolcengineVideo) return normalizeVolcengineVideoTasksUrl(url);
    if (isMagickVideo) return normalizeMagickApiVideoCreateUrl(url);
    return isNewApiVideo ? normalizeNewApiVideoCreateUrl(url) : url;
  }
  if (isVolcengineVideo) return normalizeVolcengineVideoTasksUrl(baseUrl);
  if (isMagickVideo) return appendV1Path(baseUrl, "/videos");
  if (isNewApiVideo) return appendV1Path(baseUrl, "/video/generations");
  if (apiStyle === "seedance-task")
    return appendPath(baseUrl, "/api/v1/jobs/createTask");
  if (apiStyle === "seedance-v2") return appendPath(baseUrl, "/generate");
  return appendPath(baseUrl, "/videos/generations");
}

function normalizeVolcengineVideoTasksUrl(url: string) {
  const normalized = normalizeBaseUrl(url);
  if (/\/api\/v3\/contents\/generations\/tasks$/i.test(normalized)) {
    return normalized;
  }
  try {
    const parsed = new URL(normalized);
    const path = parsed.pathname.replace(/\/+$/, "");
    parsed.pathname = path.endsWith("/api/v3")
      ? `${path}/contents/generations/tasks`
      : `${path}/api/v3/contents/generations/tasks`;
    parsed.search = "";
    return parsed.toString();
  } catch {
    return appendPath(normalized, "/api/v3/contents/generations/tasks");
  }
}

function formatTaskUrl(template: string, taskId: string) {
  if (template.includes("{taskId}"))
    return template.replaceAll("{taskId}", encodeURIComponent(taskId));
  if (template.includes("{task_id}"))
    return template.replaceAll("{task_id}", encodeURIComponent(taskId));
  const separator = template.includes("?") ? "&" : "?";
  return `${template}${separator}taskId=${encodeURIComponent(taskId)}`;
}

function appendTaskIdPath(baseUrl: string, taskId: string) {
  return `${normalizeBaseUrl(baseUrl)}/${encodeURIComponent(taskId)}`;
}

function resolveConfiguredUrl(baseUrl: string, configured: string) {
  if (/^https?:\/\//i.test(configured)) return configured;
  try {
    return new URL(configured, `${normalizeBaseUrl(baseUrl)}/`).toString();
  } catch {
    return appendPath(baseUrl, configured);
  }
}

function resolveVolcengineVideoTaskUrl(
  createUrl: string,
  params: Record<string, unknown>,
  taskId: string,
) {
  const configured = stringParam(params.statusUrl ?? params.pollUrl);
  if (configured) return formatTaskUrl(resolveConfiguredUrl(createUrl, configured), taskId);
  return appendTaskIdPath(createUrl, taskId);
}

function resolveVolcengineVideoTaskListUrl(
  createUrl: string,
  params: Record<string, unknown>,
  query: {
    pageNum?: number;
    pageSize?: number;
    status?: string;
    taskIds?: string[];
    model?: string;
    serviceTier?: string;
  } = {},
) {
  const configured = stringParam(params.listUrl ?? params.tasksUrl);
  const url = new URL(configured ? resolveConfiguredUrl(createUrl, configured) : createUrl);
  url.searchParams.set("page_num", String(query.pageNum ?? 1));
  url.searchParams.set("page_size", String(query.pageSize ?? 20));
  if (query.status) url.searchParams.set("filter.status", query.status);
  if (query.model) url.searchParams.set("filter.model", query.model);
  if (query.serviceTier) {
    url.searchParams.set("filter.service_tier", query.serviceTier);
  }
  for (const taskId of query.taskIds ?? []) {
    url.searchParams.append("filter.task_ids", taskId);
  }
  return url.toString();
}

function resolveVideoStatusUrl(
  createUrl: string,
  params: Record<string, unknown>,
  apiStyle: string,
  taskId: string,
) {
  const configured = stringParam(params.statusUrl ?? params.pollUrl);
  if (configured) return formatTaskUrl(configured, taskId);

  if (apiStyle === "volcengine-video") {
    return resolveVolcengineVideoTaskUrl(createUrl, params, taskId);
  }

  if (
    apiStyle === "seedance-task" ||
    /\/jobs\/createTask\/?$/i.test(createUrl)
  ) {
    return `${createUrl.replace(/\/jobs\/createTask\/?$/i, "/jobs/recordInfo")}?taskId=${encodeURIComponent(taskId)}`;
  }

  if (apiStyle === "seedance-v2" || /\/generate\/?$/i.test(createUrl)) {
    return `${createUrl.replace(/\/generate\/?$/i, "/status")}?task_id=${encodeURIComponent(taskId)}`;
  }

  if (/\/videos\/?$/i.test(createUrl)) {
    return `${createUrl.replace(/\/+$/, "")}/${encodeURIComponent(taskId)}`;
  }

  if (
    apiStyle === "new-api-video" ||
    /\/video\/generations\/?$/i.test(createUrl)
  ) {
    return createUrl.replace(
      /\/video\/generations\/?$/i,
      `/videos/${encodeURIComponent(taskId)}`,
    );
  }

  if (/\/videos\/generations\/?$/i.test(createUrl)) {
    return createUrl.replace(
      /\/videos\/generations\/?$/i,
      `/tasks/${encodeURIComponent(taskId)}`,
    );
  }

  return undefined;
}

function resolveVideoContentUrl(
  createUrl: string,
  params: Record<string, unknown>,
  taskId: string,
) {
  const configured = stringParam(
    params.contentUrl ?? params.contentPath ?? params.downloadContentUrl,
  );
  if (configured) return formatTaskUrl(configured, taskId);

  if (!isMagickApiUrl(createUrl)) return undefined;

  const normalized = normalizeBaseUrl(createUrl);
  if (/\/v1\/videos\/?$/i.test(normalized)) {
    return `${normalized}/${encodeURIComponent(taskId)}/content`;
  }
  if (/\/v1\/videos\/[^/]+\/?$/i.test(normalized)) {
    return `${normalized.replace(/\/+$/, "")}/content`;
  }
  return undefined;
}

const CONTROL_PARAMS = new Set([
  "apiStyle",
  "provider",
  "createUrl",
  "endpoint",
  "endpointPath",
  "statusUrl",
  "pollUrl",
  "contentUrl",
  "contentPath",
  "downloadContentUrl",
  "pollAttempts",
  "pollIntervalMs",
  "imageUrl",
  "imageUrls",
  "videoUrl",
  "videoUrls",
  "images",
  "videos",
  "reference_images",
  "referenceImages",
  "reference_videos",
  "referenceVideos",
  "media",
  "ratio",
  "aspectRatio",
  "aspect_ratio",
  "duration",
  "seconds",
  "size",
  "image_size",
  "resolution",
  "metadata",
  "mode",
  "modelCode",
  "videoInputMode",
  "generateAudio",
  "generate_audio",
  "return_last_frame",
  "returnLastFrame",
  "service_tier",
  "serviceTier",
  "execution_expires_after",
  "executionExpiresAfter",
  "safety_identifier",
  "safetyIdentifier",
  "priority",
  "draft",
  "draftTaskId",
  "draft_task_id",
  "frames",
  "negative_prompt",
  "negativePrompt",
  "prompt_extend",
  "watermark",
  "seed",
  "audio_setting",
  "firstFrameUrl",
  "lastFrameUrl",
  "referenceImageUrl",
  "referenceVideoUrl",
  "hasReferenceImage",
]);

function extraProviderParams(params: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(params).filter(
      (entry) => !CONTROL_PARAMS.has(entry[0]) && entry[1] !== undefined,
    ),
  );
}

function isVideoUrl(url: string) {
  return /\.(mp4|m4v|mov|webm)(\?|#|$)/i.test(url);
}

function normalizeVideoInputMode(value: unknown, modelName: string) {
  if (value === "T2V" || value === "I2V" || value === "R2V" || value === "EDIT") {
    return value;
  }
  const marker = modelName.toLowerCase();
  if (marker.includes("videoedit") || marker.includes("video-edit")) return "EDIT";
  if (marker.includes("r2v")) return "R2V";
  if (marker.includes("t2v")) return "T2V";
  if (marker.includes("i2v")) return "I2V";
  return "I2V";
}

function mediaItemsFromParams(params: Record<string, unknown>) {
  const metadataMedia = asRecord(params.metadata).media;
  const raw: unknown[] = Array.isArray(params.media)
    ? params.media
    : Array.isArray(metadataMedia)
      ? metadataMedia
      : [];
  return raw
    .map((item): WanVideoMediaItem | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const url = stringParam(record.url ?? record.src);
      if (!url) return null;
      const type = stringParam(record.type) ?? "reference_image";
      const referenceVoice = stringParam(record.reference_voice ?? record.referenceVoice);
      return {
        type,
        url,
        ...(referenceVoice ? { reference_voice: referenceVoice } : {}),
      };
    })
    .filter((item): item is WanVideoMediaItem => Boolean(item));
}

function wan27MediaItems(
  input: VideoGenerationInput,
  imageReferences: string[],
  videoReferences: string[],
) {
  const explicit = mediaItemsFromParams(input.params);
  if (explicit.length) return explicit;

  const mode = normalizeVideoInputMode(input.params.videoInputMode, input.modelName);
  if (mode === "T2V") return [];
  if (mode === "R2V") {
    return [
      ...imageReferences.map((url) => ({ type: "reference_image", url })),
      ...videoReferences.map((url) => ({ type: "reference_video", url })),
    ];
  }
  if (mode === "EDIT") {
    const media: WanVideoMediaItem[] = [];
    videoReferences.forEach((url, index) => {
      media.push({ type: index === 0 ? "video" : "reference_video", url });
    });
    imageReferences.forEach((url) => media.push({ type: "reference_image", url }));
    return media;
  }

  const media: WanVideoMediaItem[] = [];
  if (imageReferences[0]) media.push({ type: "first_frame", url: imageReferences[0] });
  if (imageReferences[1]) media.push({ type: "last_frame", url: imageReferences[1] });
  if (videoReferences[0]) media.push({ type: "first_clip", url: videoReferences[0] });
  return media;
}

function volcengineContentItems(
  input: VideoGenerationInput,
  imageReferences: string[],
  videoReferences: string[],
) {
  const params = input.params;
  const content: Array<Record<string, unknown>> = [];
  if (input.prompt.trim()) {
    content.push({ type: "text", text: input.prompt });
  }

  const mode = normalizeVideoInputMode(params.videoInputMode, input.modelName);
  const explicitMedia = mediaItemsFromParams(params);
  if (explicitMedia.length) {
    for (const item of explicitMedia) {
      const type = isVideoUrl(item.url) ? "video_url" : "image_url";
      content.push({
        type,
        [type]: { url: item.url },
        role: item.type,
      });
    }
    return content;
  }

  if (mode === "I2V") {
    if (imageReferences[0]) {
      content.push({
        type: "image_url",
        image_url: { url: imageReferences[0] },
        role: "first_frame",
      });
    }
    return content;
  }

  const isFrameRoleMode = mode === "R2V" && imageReferences.length === 2 && !videoReferences.length;
  for (const [index, url] of imageReferences.entries()) {
    content.push({
      type: "image_url",
      image_url: { url },
      role: isFrameRoleMode
        ? index === 0
          ? "first_frame"
          : "last_frame"
        : "reference_image",
    });
  }
  for (const url of videoReferences) {
    content.push({
      type: "video_url",
      video_url: { url },
      role: "reference_video",
    });
  }
  return content;
}

function boolParam(value: unknown, fallback?: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function intParam(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : undefined;
}

function volcengineSeedancePayload(
  input: VideoGenerationInput,
  imageReferences: string[],
  videoReferences: string[],
) {
  const params = input.params;
  const duration = intParam(params.duration ?? params.seconds) ?? 5;
  const aspectRatio =
    stringParam(params.ratio ?? params.aspectRatio ?? params.aspect_ratio) ??
    "adaptive";
  const resolution =
    stringParam(params.resolution) ??
    stringParam(params.size === "1080p" || params.size === "480p" || params.size === "720p" ? params.size : undefined) ??
    "720p";
  const extra = extraProviderParams(params);
  const generateAudio = boolParam(params.generate_audio ?? params.generateAudio);
  const returnLastFrame = boolParam(params.return_last_frame ?? params.returnLastFrame);
  const serviceTier = stringParam(params.service_tier ?? params.serviceTier);
  const executionExpiresAfter = intParam(
    params.execution_expires_after ?? params.executionExpiresAfter,
  );
  const safetyIdentifier = stringParam(
    params.safety_identifier ?? params.safetyIdentifier,
  );
  const priority = intParam(params.priority);
  const draft = boolParam(params.draft);
  const draftTaskId = stringParam(params.draft_task_id ?? params.draftTaskId);
  const frames = intParam(params.frames);

  return {
    ...extra,
    model: input.modelName,
    content: draftTaskId
      ? [
          ...volcengineContentItems(input, imageReferences, videoReferences),
          { type: "draft_task", draft_task: { id: draftTaskId } },
        ]
      : volcengineContentItems(input, imageReferences, videoReferences),
    resolution: resolution.toLowerCase(),
    ratio: aspectRatio,
    ...(frames !== undefined ? { frames } : { duration }),
    ...(params.seed !== undefined ? { seed: params.seed } : {}),
    ...(params.watermark !== undefined ? { watermark: boolParam(params.watermark, false) } : {}),
    ...(params.camera_fixed !== undefined || params.cameraFixed !== undefined
      ? { camera_fixed: boolParam(params.camera_fixed ?? params.cameraFixed, false) }
      : {}),
    ...(generateAudio !== undefined ? { generate_audio: generateAudio } : {}),
    ...(returnLastFrame !== undefined ? { return_last_frame: returnLastFrame } : {}),
    ...(serviceTier ? { service_tier: serviceTier } : {}),
    ...(executionExpiresAfter !== undefined
      ? { execution_expires_after: executionExpiresAfter }
      : {}),
    ...(safetyIdentifier ? { safety_identifier: safetyIdentifier } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(draft !== undefined ? { draft } : {}),
  };
}

function buildVideoPayload(
  input: VideoGenerationInput,
  apiStyle: string,
): Record<string, unknown> {
  const params = input.params;
  const imageUrls = input.imageUrls?.filter(Boolean) ?? [];
  const imageReferences = imageUrls.filter((url) => !isVideoUrl(url));
  const videoReferences = imageUrls.filter((url) => isVideoUrl(url));
  const duration = params.duration ?? 5;
  const aspectRatio =
    stringParam(params.aspectRatio ?? params.aspect_ratio ?? params.ratio) ??
    "16:9";
  const extra = extraProviderParams(params);

  if (apiStyle === "volcengine-video") {
    return volcengineSeedancePayload(input, imageReferences, videoReferences);
  }

  if (apiStyle === "seedance-task") {
    return {
      model: input.modelName,
      callBackUrl: params.callBackUrl,
      callbackUrl: params.callbackUrl,
      inputs: {
        ...extra,
        prompt: input.prompt,
        duration: String(duration),
        aspectRatio,
        ...(imageUrls.length ? { urls: imageUrls } : {}),
      },
    };
  }

  if (apiStyle === "seedance-v2") {
    return {
      ...extra,
      prompt: input.prompt,
      duration,
      aspect_ratio: aspectRatio,
      model: input.modelName,
      ...(imageUrls.length ? { images: imageUrls } : {}),
    };
  }

  if (apiStyle === "fal") {
    return {
      ...extra,
      prompt: input.prompt,
      ...(imageUrls[0] ? { image_url: imageUrls[0] } : {}),
      ...(duration ? { duration } : {}),
      aspect_ratio: aspectRatio,
    };
  }

  if (apiStyle === "dpi-chat-completions") {
    const content = [
      { type: "text", text: input.prompt },
      ...imageUrls.map((url) => ({
        type: "image_url",
        image_url: { url },
      })),
    ];
    return {
      model: input.modelName,
      messages: [
        {
          role: "user",
          content: imageUrls.length ? content : input.prompt,
        },
      ],
      stream: true,
    };
  }

  if (apiStyle === "magick-video") {
    const rawMetadata = asRecord(params.metadata);
    const resolution = stringParam(params.resolution ?? rawMetadata.resolution);
    const media = wan27MediaItems(input, imageReferences, videoReferences);
    const negativePrompt = stringParam(params.negative_prompt ?? params.negativePrompt);
    const metadata = {
      ...rawMetadata,
      ...(params.prompt_extend !== undefined &&
      rawMetadata.prompt_extend === undefined
        ? { prompt_extend: params.prompt_extend }
        : {}),
      ...(params.watermark !== undefined && rawMetadata.watermark === undefined
        ? { watermark: params.watermark }
        : rawMetadata.watermark === undefined
          ? { watermark: false }
          : {}),
      ...(params.seed !== undefined && rawMetadata.seed === undefined
        ? { seed: params.seed }
        : {}),
      ...(params.audio_setting !== undefined &&
      rawMetadata.audio_setting === undefined
        ? { audio_setting: params.audio_setting }
        : {}),
    };
    return {
      ...extra,
      model: input.modelName,
      prompt: input.prompt,
      ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
      duration,
      seconds: String(duration),
      resolution: (resolution ?? "720P").toUpperCase(),
      ratio: aspectRatio,
      metadata,
      ...(media.length ? { media } : {}),
    };
  }

  if (apiStyle === "new-api-video") {
    const rawMetadata = asRecord(params.metadata);
    const resolution = stringParam(params.resolution ?? rawMetadata.resolution);
    const size =
      videoSizeParam(params, aspectRatio, resolution) ?? ratioToVideoSize(aspectRatio);
    const fps = params.fps ?? rawMetadata.fps ?? 24;
    const metadata = {
      ...extra,
      ...rawMetadata,
      duration,
      fps,
      ...(resolution ? { resolution: resolution.toUpperCase() } : {}),
      ...(params.generateAudio !== undefined
        ? { audio: Boolean(params.generateAudio) }
        : {}),
    };
    return {
      model: input.modelName,
      prompt: input.prompt,
      duration,
      seconds: String(duration),
      size,
      metadata,
      ...(mediaItemsFromParams(params).length
        ? { media: mediaItemsFromParams(params) }
        : {}),
      ...(imageReferences.length === 1
        ? { image: imageReferences[0], input_reference: imageReferences[0] }
        : {}),
      ...(imageReferences.length ? { images: imageReferences } : {}),
      ...(videoReferences.length === 1 ? { video: videoReferences[0] } : {}),
      ...(videoReferences.length ? { videos: videoReferences } : {}),
    };
  }

  return {
    ...extra,
    model: input.modelName,
    prompt: input.prompt,
    duration,
    aspect_ratio: aspectRatio,
    ...(imageReferences.length ? { image_urls: imageReferences } : {}),
    ...(videoReferences.length ? { video_urls: videoReferences } : {}),
  };
}

function ratioToVideoSize(aspectRatio: string) {
  switch (aspectRatio) {
    case "16:9":
      return "1280x720";
    case "9:16":
      return "720x1280";
    case "4:3":
      return "1152x896";
    case "3:4":
      return "896x1152";
    case "1:1":
    default:
      return "1024x1024";
  }
}

function videoSizeParam(
  params: Record<string, unknown>,
  aspectRatio: string,
  resolution?: string,
) {
  const explicit = stringParam(params.size ?? params.image_size);
  if (explicit) return explicit;

  const normalizedResolution = resolution?.toLowerCase();
  const base =
    normalizedResolution?.includes("1080")
      ? 1080
      : normalizedResolution?.includes("720")
        ? 720
        : undefined;
  if (!base) return undefined;

  const match = aspectRatio.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return undefined;
  const widthRatio = Number(match[1]);
  const heightRatio = Number(match[2]);
  if (
    !Number.isFinite(widthRatio) ||
    !Number.isFinite(heightRatio) ||
    heightRatio <= 0 ||
    widthRatio <= 0
  ) {
    return undefined;
  }

  if (widthRatio >= heightRatio) {
    return `${Math.round((base * widthRatio) / heightRatio)}x${base}`;
  }
  return `${base}x${Math.round((base * heightRatio) / widthRatio)}`;
}

function getPath(
  record: unknown,
  path: Array<string | number>,
) {
  let current: unknown = record;
  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Array.isArray(current) || segment < 0 || segment >= current.length) {
        return undefined;
      }
      current = current[segment];
      continue;
    }

    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function collectUrls(value: unknown, acc = new Set<string>()) {
  if (!value) return acc;
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) acc.add(value);
    return acc;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectUrls(item, acc));
    return acc;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of [
      "url",
      "uri",
      "href",
      "video_url",
      "videoUrl",
      "fifeUrl",
      "fife_url",
      "file_url",
      "fileUrl",
      "fileUri",
      "outputUri",
      "output_uri",
      "download_url",
      "downloadUrl",
      "downloadUri",
      "assetUrl",
      "asset_url",
      "result_url",
      "resultUrl",
    ]) {
      collectUrls(record[key], acc);
    }
    for (const key of [
      "video",
      "videos",
      "output",
      "outputs",
      "result",
      "results",
      "response",
      "data",
    ]) {
      collectUrls(record[key], acc);
    }
  }
  return acc;
}

function extractChatCompletionMessageContent(payload: unknown) {
  const record = asRecord(payload);
  const choices = Array.isArray(record.choices) ? record.choices : [];
  return choices
    .map((rawChoice) => {
      const choice = asRecord(rawChoice);
      const message = asRecord(choice.message);
      return stringParam(message.content);
    })
    .filter((item): item is string => Boolean(item));
}

function extractVideoMarkupUrls(content: string) {
  const matches = [
    ...content.matchAll(/<video[^>]+src=['"]([^'"]+)['"]/gi),
  ];
  return matches
    .map((match) => match[1]?.trim())
    .filter((item): item is string => Boolean(item));
}

function extractVideoUrls(payload: unknown) {
  const record = asRecord(payload);
  const buckets = [
    record.content,
    record.output,
    record.outputs,
    record.result,
    record.results,
    record.response,
    record.video,
    record.videos,
    record.metadata,
    getPath(record, ["data", "output"]),
    getPath(record, ["data", "outputs"]),
    getPath(record, ["data", "result"]),
    getPath(record, ["data", "results"]),
    getPath(record, ["data", "response"]),
    getPath(record, ["data", "content"]),
    getPath(record, ["data", "video"]),
    getPath(record, ["data", "videos"]),
    getPath(record, ["data", "metadata"]),
    getPath(record, ["result", "content"]),
    getPath(record, ["response", "content"]),
  ];
  const urls = new Set<string>();
  buckets.forEach((bucket) => collectUrls(bucket, urls));
  for (const key of [
    "url",
    "video_url",
    "videoUrl",
    "file_url",
    "fileUrl",
    "download_url",
    "downloadUrl",
    "result_url",
    "resultUrl",
    "fail_reason",
    "failReason",
  ]) {
    collectUrls(record[key], urls);
    collectUrls(getPath(record, ["data", key]), urls);
  }
  extractChatCompletionMessageContent(record).forEach((content) => {
    extractVideoMarkupUrls(content).forEach((url) => urls.add(url));
  });
  return [...urls];
}

function extractVideoTaskItems(payload: unknown): unknown[] {
  const record = asRecord(payload);
  const candidates = [
    record.items,
    getPath(record, ["data", "items"]),
    getPath(record, ["response", "items"]),
    getPath(record, ["result", "items"]),
  ];
  const items = candidates.find(Array.isArray);
  return Array.isArray(items) ? items : [];
}

function extractVideoTaskTotal(payload: unknown) {
  const record = asRecord(payload);
  const value =
    record.total ??
    getPath(record, ["data", "total"]) ??
    getPath(record, ["response", "total"]) ??
    getPath(record, ["result", "total"]);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

function parseVideoTaskResult(payload: unknown, fallbackTaskId?: string): VideoTaskResult {
  const providerJobId =
    extractTaskId(payload) ??
    (fallbackTaskId && fallbackTaskId.trim() ? fallbackTaskId.trim() : "");
  return {
    providerJobId,
    status: extractStatus(payload),
    items: extractVideoUrls(payload).map((url) => ({
      url,
      contentType: "video/mp4",
      providerJobId: providerJobId || undefined,
    })),
    error: extractProviderError(payload),
    raw: payload,
  };
}

function extractTaskId(payload: unknown) {
  const record = asRecord(payload);
  const candidates = [
    record.taskId,
    record.task_id,
    record.id,
    getPath(record, ["response", "id"]),
    getPath(record, ["result", "id"]),
    getPath(record, ["operation", "name"]),
    getPath(record, ["operations", 0, "taskId"]),
    getPath(record, ["operations", 0, "task_id"]),
    getPath(record, ["operations", 0, "id"]),
    getPath(record, ["operations", 0, "operation", "name"]),
    getPath(record, ["data", "taskId"]),
    getPath(record, ["data", "task_id"]),
    getPath(record, ["data", "id"]),
    getPath(record, ["data", "operation", "name"]),
    getPath(record, ["data", "operations", 0, "taskId"]),
    getPath(record, ["data", "operations", 0, "task_id"]),
    getPath(record, ["data", "operations", 0, "id"]),
    getPath(record, ["data", "operations", 0, "operation", "name"]),
  ];
  const value = candidates.find(
    (item) =>
      (typeof item === "string" && item.trim().length > 0) ||
      (typeof item === "number" && Number.isFinite(item)),
  );
  return value === undefined ? undefined : String(value);
}

function extractStatus(payload: unknown) {
  const record = asRecord(payload);
  const candidates = [
    record.status,
    record.state,
    record.taskStatus,
    record.task_status,
    record.statusText,
    record.status_text,
    getPath(record, ["operation", "status"]),
    getPath(record, ["operation", "state"]),
    getPath(record, ["operations", 0, "status"]),
    getPath(record, ["operations", 0, "state"]),
    getPath(record, ["operations", 0, "operation", "status"]),
    getPath(record, ["operations", 0, "operation", "state"]),
    getPath(record, ["data", "status"]),
    getPath(record, ["data", "state"]),
    getPath(record, ["data", "taskStatus"]),
    getPath(record, ["data", "task_status"]),
    getPath(record, ["data", "statusText"]),
    getPath(record, ["data", "status_text"]),
    getPath(record, ["data", "operation", "status"]),
    getPath(record, ["data", "operation", "state"]),
    getPath(record, ["data", "operations", 0, "status"]),
    getPath(record, ["data", "operations", 0, "state"]),
    getPath(record, ["data", "operations", 0, "operation", "status"]),
    getPath(record, ["data", "operations", 0, "operation", "state"]),
    getPath(record, ["task", "status"]),
    getPath(record, ["task", "state"]),
    getPath(record, ["data", "task", "status"]),
    getPath(record, ["data", "task", "state"]),
    getPath(record, ["result", "status"]),
    getPath(record, ["result", "state"]),
    getPath(record, ["response", "status"]),
    getPath(record, ["response", "state"]),
  ];
  return candidates
    .map((value) => normalizeStatus(value))
    .find((value): value is string => Boolean(value));
}

function extractProgress(payload: unknown) {
  const record = asRecord(payload);
  const candidates = [
    record.progress,
    record.current_progress,
    record.percentage,
    record.percent,
    getPath(record, ["operation", "progress"]),
    getPath(record, ["operations", 0, "progress"]),
    getPath(record, ["operations", 0, "operation", "progress"]),
    getPath(record, ["data", "progress"]),
    getPath(record, ["data", "current_progress"]),
    getPath(record, ["data", "percentage"]),
    getPath(record, ["data", "percent"]),
    getPath(record, ["data", "operation", "progress"]),
    getPath(record, ["data", "operations", 0, "progress"]),
    getPath(record, ["data", "operations", 0, "operation", "progress"]),
  ];
  const value = candidates.find(
    (item) =>
      typeof item === "number" ||
      (typeof item === "string" && item.trim().length > 0),
  );
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value > 0 && value <= 1 ? value * 100 : value);
  }
  if (typeof value !== "string") return undefined;
  const numeric = Number(value.trim().replace("%", ""));
  if (!Number.isFinite(numeric)) return undefined;
  return Math.round(numeric > 0 && numeric <= 1 ? numeric * 100 : numeric);
}

function progressForStatus(status: string | undefined) {
  const normalized = normalizeStatus(status);
  if (!normalized) return undefined;
  if (normalized.includes("submitted")) return 10;
  if (
    normalized.includes("queued") ||
    normalized.includes("pending") ||
    normalized.includes("dispatched")
  ) {
    return 20;
  }
  if (
    normalized.includes("running") ||
    normalized.includes("in_progress") ||
    normalized.includes("processing") ||
    normalized.includes("active")
  ) {
    return 30;
  }
  if (
    normalized.includes("successful") ||
    normalized.includes("succeeded") ||
    normalized.includes("success") ||
    normalized.includes("completed") ||
    normalized.includes("complete") ||
    normalized.includes("ready")
  ) {
    return 100;
  }
  if (isFailureStatus(normalized)) return 100;
  return undefined;
}

function isSuccessStatus(status: string | undefined) {
  const normalized = normalizeStatus(status);
  if (!normalized) return false;
  return (
    normalized.includes("successful") ||
    normalized.includes("succeeded") ||
    normalized.includes("success") ||
    normalized.includes("completed") ||
    normalized.includes("complete") ||
    normalized.includes("ready")
  );
}

function normalizeProgress(progress: number | undefined) {
  if (progress === undefined || !Number.isFinite(progress)) return undefined;
  return Math.min(100, Math.max(0, Math.round(progress)));
}

function extractProviderError(payload: unknown) {
  const record = asRecord(payload);
  const values = [
    record.error,
    record.error_message,
    record.errorMessage,
    record.message,
    record.detail,
    record.reason,
    record.fail_reason,
    record.failReason,
    getPath(record, ["operation", "error"]),
    getPath(record, ["operations", 0, "operation", "error"]),
    getPath(record, ["operations", 0, "operation", "message"]),
    getPath(record, ["operations", 0, "operation", "detail"]),
    getPath(record, ["data", "error"]),
    getPath(record, ["data", "error_message"]),
    getPath(record, ["data", "errorMessage"]),
    getPath(record, ["data", "message"]),
    getPath(record, ["data", "detail"]),
    getPath(record, ["data", "reason"]),
    getPath(record, ["data", "fail_reason"]),
    getPath(record, ["data", "failReason"]),
    getPath(record, ["data", "operation", "error"]),
    getPath(record, ["data", "operations", 0, "operation", "error"]),
    getPath(record, ["data", "operations", 0, "operation", "message"]),
    getPath(record, ["data", "operations", 0, "operation", "detail"]),
  ];

  for (const value of values) {
    const text = stringParam(value);
    if (text) return text;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const nested = value as Record<string, unknown>;
    for (const candidate of [
      nested.message,
      nested.detail,
      nested.reason,
      nested.error_message,
      nested.errorMessage,
      nested.fail_reason,
      nested.failReason,
      nested.code,
    ]) {
      const nestedText = stringParam(candidate);
      if (nestedText) return nestedText;
    }
  }

  return undefined;
}

function isFailureStatus(status: string | undefined) {
  const normalized = normalizeStatus(status);
  if (!normalized) return false;
  return (
    normalized === "failed" ||
    normalized === "failure" ||
    normalized === "fail" ||
    normalized === "error" ||
    normalized === "canceled" ||
    normalized === "cancelled" ||
    normalized === "timeout" ||
    normalized === "timed_out" ||
    normalized === "expired" ||
    normalized.includes("failed") ||
    normalized.includes("error") ||
    normalized.includes("cancel") ||
    normalized.includes("timed_out")
  );
}

function text2ImageFailureMessage(
  status: string | undefined,
  payload: unknown,
  fallbackError?: string,
) {
  return (
    fallbackError ??
    extractProviderError(payload) ??
    (status ? `Image generation failed with status ${status}` : undefined)
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientDownloadError(err: unknown) {
  if (!axios.isAxiosError(err)) return false;
  const status = err.response?.status;
  return (
    status === 404 ||
    status === 408 ||
    status === 429 ||
    (typeof status === "number" && status >= 500)
  );
}

function isTransientCreateError(err: unknown) {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    return (
      !status ||
      status === 408 ||
      status === 409 ||
      status === 425 ||
      status === 429 ||
      status >= 500
    );
  }

  const message = ((err as Error).message ?? "").toLowerCase();
  return (
    message.includes("socket hang up") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("timeout") ||
    message.includes("event stream aborted") ||
    message.includes("closed before completion") ||
    message.includes("network socket disconnected") ||
    message.includes("connection reset")
  );
}

function describeAxiosFailure(err: unknown) {
  if (!axios.isAxiosError(err)) return (err as Error).message;
  const status = err.response?.status;
  const url = err.config?.url;
  const body = err.response?.data;
  const message =
    body && typeof body === "object" && "error" in body
      ? JSON.stringify(body.error)
      : body && typeof body === "object"
        ? JSON.stringify(body)
      : typeof body === "string"
        ? body.slice(0, 500)
        : err.message;
  const prefix = status ? `HTTP ${status}` : err.message;
  return `${prefix}${url ? ` at ${url}` : ""}: ${message}`;
}

interface SseReadResult {
  payloads: unknown[];
  ended: boolean;
  error?: Error;
}

function parseSseDataBlock(
  block: string,
  options: { allowPayloadErrors?: boolean } = {},
) {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n")
    .trim();
  if (!data || data === "[DONE]") return undefined;
  try {
    const parsed = JSON.parse(data) as unknown;
    const providerError = extractProviderError(parsed);
    if (providerError && !options.allowPayloadErrors) {
      throw new Error(providerError);
    }
    return parsed;
  } catch (err) {
    throw new Error(
      `Unable to parse upstream event stream: ${(err as Error).message}`,
    );
  }
}

async function readSsePayloads(
  stream: NodeJS.ReadableStream,
  options: { allowPayloadErrors?: boolean } = {},
): Promise<SseReadResult> {
  const payloads: unknown[] = [];
  return await new Promise<SseReadResult>((resolve, reject) => {
    let buffer = "";
    let settled = false;

    const cleanup = () => {
      stream.removeListener("data", onData);
      stream.removeListener("end", onEnd);
      stream.removeListener("error", onError);
      stream.removeListener("aborted", onAborted);
      stream.removeListener("close", onClose);
    };
    const finish = (result: SseReadResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const fail = (err: unknown) => {
      if (settled) return;
      const normalized = err instanceof Error ? err : new Error(String(err));
      if (payloads.length) {
        finish({ payloads, ended: false, error: normalized });
        return;
      }
      settled = true;
      cleanup();
      reject(normalized);
    };
    const pushParsedBlock = (block: string) => {
      const parsed = parseSseDataBlock(block, options);
      if (parsed !== undefined) payloads.push(parsed);
    };
    const drainCompleteBlocks = () => {
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        if (block.trim()) pushParsedBlock(block);
      }
    };
    const drainRemainingBuffer = () => {
      const remaining = buffer;
      buffer = "";
      if (remaining.trim()) pushParsedBlock(remaining);
    };
    function onData(chunk: string | Buffer) {
      if (settled) return;
      buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      try {
        drainCompleteBlocks();
      } catch (err) {
        fail(err);
      }
    }
    function onEnd() {
      if (settled) return;
      try {
        drainRemainingBuffer();
        finish({ payloads, ended: true });
      } catch (err) {
        fail(err);
      }
    }
    function onError(err: Error) {
      if (settled) return;
      try {
        drainRemainingBuffer();
      } catch {
        // Ignore a truncated trailing SSE block and keep any complete events.
      }
      fail(err);
    }
    function onAborted() {
      onError(new Error("upstream event stream aborted"));
    }
    function onClose() {
      if (!settled) {
        onError(new Error("upstream event stream closed before completion"));
      }
    }

    stream.setEncoding("utf8");
    stream.on("data", onData);
    stream.on("end", onEnd);
    stream.on("error", onError);
    stream.on("aborted", onAborted);
    stream.on("close", onClose);
  });
}

function parseSsePayloads(
  rawBody: string,
  options: { allowPayloadErrors?: boolean } = {},
) {
  const payloads: unknown[] = [];
  const blocks = rawBody.split(/\r?\n\r?\n/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    const parsed = parseSseDataBlock(block, options);
    if (parsed !== undefined) payloads.push(parsed);
  }
  return payloads;
}

function summarizeSsePayloadTypes(payloads: unknown[]) {
  const counts = new Map<string, number>();
  for (const payload of payloads) {
    const type = stringParam(asRecord(payload).type) ?? "unknown";
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([type, count]) => `${type}:${count}`)
    .join(", ");
}

function streamCompletionContent(payloads: unknown[]) {
  return payloads
    .flatMap((payload) => {
      const record = asRecord(payload);
      const choices = Array.isArray(record.choices) ? record.choices : [];
      return choices
        .map((rawChoice) => {
          const choice = asRecord(rawChoice);
          const delta = asRecord(choice.delta);
          return stringParam(delta.content);
        })
        .filter((item): item is string => Boolean(item));
    })
    .join("");
}

function responseFromStreamPayloads(payloads: unknown[]) {
  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: streamCompletionContent(payloads),
        },
      },
    ],
  };
}

function resolveText2ImageTaskUrl(
  createUrl: string,
  input: Text2ImageInput,
  taskId: string,
) {
  const configured = stringParam(
    input.statusUrl ??
      input.params.taskUrl ??
      input.params.imageTaskUrl ??
      input.params.imageTaskStatusUrl ??
      input.params.statusUrl ??
      input.params.pollUrl,
  );
  if (configured) return formatTaskUrl(configured, taskId);

  if (/\/v1\/(?:flux-[^/]+|flux-tools\/[^/]+)\/?$/i.test(createUrl)) {
    return createUrl.replace(
      /\/v1\/(?:flux-[^/]+|flux-tools\/[^/]+)\/?$/i,
      `/v1/get_result?id=${encodeURIComponent(taskId)}`,
    );
  }

  if (input.apiStyle !== "CREX") return undefined;

  if (/\/images\/generations\/?$/i.test(createUrl)) {
    return createUrl.replace(
      /\/images\/generations\/?$/i,
      `/images/tasks/${encodeURIComponent(taskId)}`,
    );
  }

  if (/\/images\/edits\/?$/i.test(createUrl)) {
    const origin = originForUrl(createUrl);
    return origin
      ? `${origin}/v1/get_result?id=${encodeURIComponent(taskId)}`
      : createUrl.replace(
          /\/images\/edits\/?$/i,
          `/get_result?id=${encodeURIComponent(taskId)}`,
        );
  }

  const origin = originForUrl(createUrl);
  return origin
    ? `${origin}/v1/images/tasks/${encodeURIComponent(taskId)}`
    : undefined;
}

function resolveText2ImageTaskUrlFromBase(
  input: Text2ImageInput,
  taskId: string,
) {
  const adapter = selectText2ImageAdapter(input, { directProviderOrigins: [] });
  return resolveText2ImageTaskUrl(
    adapter.resolveUrl(input),
    input,
    taskId,
  );
}

function text2ImageRequestTimeoutMs(input: Text2ImageInput, expectsStream: boolean) {
  if (expectsStream) return 15 * 60_000;
  const configured =
    input.params.requestTimeoutMs ??
    input.params.upstreamRequestTimeoutMs ??
    process.env.TEXT2IMAGE_REQUEST_TIMEOUT_MS;
  if (configured !== undefined) {
    return Math.max(
      1000,
      Math.min(15 * 60_000, Math.round(numberParam(configured, 8 * 60_000))),
    );
  }
  return Math.max(
    120_000,
    Math.min(
      15 * 60_000,
      Math.round(numberParam(input.params.requestTimeoutMs, 8 * 60_000)),
    ),
  );
}

function text2ImageConnectTimeoutMs(input: Text2ImageInput) {
  return Math.max(
    1000,
    Math.min(
      60_000,
      Math.round(
        numberParam(
          input.params.connectTimeoutMs ??
            input.params.upstreamConnectTimeoutMs ??
            process.env.TEXT2IMAGE_CONNECT_TIMEOUT_MS,
          10_000,
        ),
      ),
    ),
  );
}

function connectTargetDescription(options: net.NetConnectOpts | tls.ConnectionOptions) {
  const host =
    "host" in options && typeof options.host === "string"
      ? options.host
      : "hostname" in options && typeof options.hostname === "string"
        ? options.hostname
        : "unknown";
  const port =
    "port" in options && (typeof options.port === "number" || typeof options.port === "string")
      ? String(options.port)
      : undefined;
  return port ? `${host}:${port}` : host;
}

function applyConnectTimeout(
  socket: net.Socket | tls.TLSSocket,
  options: net.NetConnectOpts | tls.ConnectionOptions,
  timeoutMs: number,
) {
  const timer = setTimeout(() => {
    const err = new Error(
      `connect timeout after ${timeoutMs}ms to ${connectTargetDescription(options)}`,
    ) as NodeJS.ErrnoException;
    err.code = "ETIMEDOUT";
    socket.destroy(err);
  }, timeoutMs);
  timer.unref();
  const clear = () => clearTimeout(timer);
  socket.once(socket instanceof tls.TLSSocket ? "secureConnect" : "connect", clear);
  socket.once("error", clear);
  socket.once("close", clear);
}

class Text2ImageHttpAgent extends http.Agent {
  constructor(private readonly connectTimeoutMs: number) {
    super({ keepAlive: false });
  }

  override createConnection(options: http.ClientRequestArgs) {
    const connectOptions = options as net.NetConnectOpts;
    const socket = net.createConnection(connectOptions);
    applyConnectTimeout(socket, connectOptions, this.connectTimeoutMs);
    return socket;
  }
}

class Text2ImageHttpsAgent extends https.Agent {
  constructor(private readonly connectTimeoutMs: number) {
    super({ keepAlive: false });
  }

  override createConnection(options: https.RequestOptions) {
    const connectOptions = options as tls.ConnectionOptions;
    const socket = tls.connect(connectOptions);
    applyConnectTimeout(socket, connectOptions, this.connectTimeoutMs);
    return socket;
  }
}

function text2ImageConnectTimeoutAgents(timeoutMs: number) {
  return {
    httpAgent: new Text2ImageHttpAgent(timeoutMs),
    httpsAgent: new Text2ImageHttpsAgent(timeoutMs),
  };
}

function text2ImageCreateAttempts(
  input: Text2ImageInput,
  adapterName: string,
  expectsStream: boolean,
) {
  const configured =
    input.params.requestAttempts ??
    input.params.retryAttempts ??
    input.params.upstreamRetryAttempts;
  const fallback = adapterName === "volcengine-seedream" && expectsStream ? 2 : 1;
  return Math.max(
    1,
    Math.min(3, Math.round(numberParam(configured, fallback))),
  );
}

function text2ImageRetryDelayMs(input: Text2ImageInput, attempt: number) {
  return Math.max(
    250,
    Math.min(
      10_000,
      Math.round(numberParam(input.params.retryDelayMs, 1000 * attempt)),
    ),
  );
}

function withText2ImageProviderJobId(
  items: GeneratedItem[],
  providerJobId?: string,
) {
  return items.map((item) => ({
    ...item,
    providerJobId: item.providerJobId ?? providerJobId,
  }));
}

function waitForResultParam(params: Record<string, unknown>) {
  return params.wait_for_result ?? params.waitForResult;
}

function shouldDefaultAsyncText2Image(
  input: Text2ImageInput,
  adapterName: string,
) {
  if (
    adapterName !== "openai-compatible-project-oss" &&
    adapterName !== "direct-hosted-image"
  ) {
    return false;
  }
  if (
    typeof input.params.async === "boolean" ||
    typeof waitForResultParam(input.params) === "boolean"
  ) {
    return false;
  }

  const origin = originForUrl(input.baseUrl)?.toLowerCase();
  if (origin === "https://api.openai.com") return false;

  const provider = stringParam(input.params.apiStyle ?? input.params.provider);
  if (input.apiStyle === "OPENAI") return false;
  return (
    input.apiStyle === "CREX" ||
    provider === "CREX" ||
    provider === "crex" ||
    provider === "chatgpt2api" ||
    provider === "gpt2api" ||
    provider === "bpi" ||
    provider === "openai-compatible-async"
  );
}

function withDefaultAsyncText2ImageParams(
  input: Text2ImageInput,
  adapterName: string,
) {
  if (!shouldDefaultAsyncText2Image(input, adapterName)) return input;
  return {
    ...input,
    params: {
      async: true,
      pollAttempts: 360,
      pollIntervalMs: 5000,
      maxPollDurationMs: 15 * 60_000,
      requestTimeoutMs: 15 * 60_000,
      ...input.params,
    },
  };
}

function isTransientTaskPollError(err: unknown) {
  if (!axios.isAxiosError(err)) return false;
  const status = err.response?.status;
  return (
    !status ||
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

function isRecoverableImageTaskFailure(errorMessage: string | undefined) {
  const normalized = errorMessage?.trim().toLowerCase() ?? "";
  return normalized.includes("still processing");
}

export class Text2ImageTaskStillRunningError extends Error {
  constructor(
    readonly taskId: string,
    message = `Image generation task ${taskId} is still running upstream`,
  ) {
    super(message);
    this.name = "Text2ImageTaskStillRunningError";
  }
}

function videoRequestHeaders(apiKey: string, createUrl: string) {
  const normalizedApiKey = apiKey.trim().replace(/^Bearer\s+/i, "").trim();
  return {
    Authorization: `Bearer ${normalizedApiKey}`,
    "Content-Type": "application/json",
  };
}

function videoPollHeaders(apiKey: string) {
  const normalizedApiKey = apiKey.trim().replace(/^Bearer\s+/i, "").trim();
  return { Authorization: `Bearer ${normalizedApiKey}` };
}

function imageEditPrompt(input: Text2ImageInput) {
  if (!stringParam(input.params.modeCode)) return input.prompt;
  return (
    stringParam(input.prompt) ??
    stringParam(input.params.prompt) ??
    stringParam(input.params.defaultPrompt) ??
    input.prompt
  );
}

function buildImageEditProviderInput(input: Text2ImageInput): Text2ImageInput {
  const prompt = imageEditPrompt(input);
  return prompt === input.prompt ? input : { ...input, prompt };
}

@Injectable()
export class GenerationProviderClient {
  private readonly logger = new Logger(GenerationProviderClient.name);

  constructor(private readonly config: ConfigService) {}

  async text2image(input: Text2ImageInput): Promise<GeneratedItem[]> {
    if (!input.apiKey) {
      throw new Error("AI model API token is not configured");
    }
    const adapter = selectText2ImageAdapter(input, {
      directProviderOrigins: parseDirectText2ImageOrigins(
        this.config.get<string>(DIRECT_TEXT2IMAGE_ORIGINS_ENV),
      ),
    });
    const providerInput = buildImageEditProviderInput(
      withDefaultAsyncText2ImageParams(input, adapter.name),
    );
    const url = adapter.resolveUrl(providerInput);
    const payload = adapter.buildPayload(providerInput);
    const expectsStream = payload.stream === true;
    const requestTimeoutMs = text2ImageRequestTimeoutMs(providerInput, expectsStream);
    const connectTimeoutMs = text2ImageConnectTimeoutMs(providerInput);
    const connectTimeoutAgents = text2ImageConnectTimeoutAgents(connectTimeoutMs);
    try {
      if (providerInput.existingProviderJobId) {
        return this.pollText2ImageTask({
          adapter,
          createUrl: url,
          input: providerInput,
          initialResult: {
            items: [],
            providerJobId: providerInput.existingProviderJobId,
            status: "running",
          },
          taskId: providerInput.existingProviderJobId,
        });
      }

      const createAttempts = text2ImageCreateAttempts(
        providerInput,
        adapter.name,
        expectsStream,
      );
      for (let attempt = 1; attempt <= createAttempts; attempt += 1) {
        try {
          if (adapter.debugPayload) {
            this.logger.debug(
              `Text2image request via ${adapter.name}: ${JSON.stringify({
                url,
                attempt,
                attempts: createAttempts,
                payload: adapter.debugPayload(payload),
              })}`,
            );
          }
          const res = await axios.post(url, payload, {
            headers: adapter.requestHeaders?.(providerInput) ?? {
              Authorization: `Bearer ${providerInput.apiKey}`,
              "Content-Type": "application/json",
            },
            ...(expectsStream ? { responseType: "stream" as const } : {}),
            timeout: requestTimeoutMs,
            ...connectTimeoutAgents,
          });
          const streamResult = expectsStream
            ? await readSsePayloads(res.data as NodeJS.ReadableStream, {
                allowPayloadErrors: Boolean(adapter.parseStreamPayloads),
              })
            : null;
          if (streamResult) {
            const summary = summarizeSsePayloadTypes(streamResult.payloads);
            const suffix = streamResult.ended
              ? ""
              : `; upstream stream ended with ${streamResult.error?.message ?? "an error"}`;
            this.logger.debug(
              `Text2image stream via ${adapter.name}: events=${streamResult.payloads.length}${summary ? ` (${summary})` : ""}${suffix}`,
            );
          }
          const streamPayloads = streamResult?.payloads ?? null;
          const responsePayload = streamPayloads
            ? responseFromStreamPayloads(streamPayloads)
            : res.data;
          const result =
            streamPayloads && adapter.parseStreamPayloads
              ? adapter.parseStreamPayloads(streamPayloads, providerInput)
              : adapter.parseResponse(responsePayload, providerInput);
          if (result.providerJobId) {
            await providerInput.onProviderJobId?.(result.providerJobId, res.data);
          }
          const status = result.status ?? extractStatus(responsePayload);
          if (isFailureStatus(status)) {
            throw new Error(
              text2ImageFailureMessage(status, responsePayload, result.error) ??
                "Image generation failed upstream",
            );
          }
          if (result.items.length) {
            return withText2ImageProviderJobId(
              result.items,
              result.providerJobId,
            );
          }
          if (result.error) {
            throw new Error(result.error);
          }
          if (streamResult?.error) {
            throw streamResult.error;
          }
          if (!expectsStream && result.providerJobId) {
            return this.pollText2ImageTask({
              adapter,
              createUrl: url,
              input: providerInput,
              initialResult: result,
              taskId: result.providerJobId,
            });
          }
          return [];
        } catch (err) {
          if (
            attempt < createAttempts &&
            isTransientCreateError(err)
          ) {
            this.logger.warn(
              `Text2image transient upstream error via ${adapter.name}; retrying attempt ${attempt + 1}/${createAttempts}: ${describeAxiosFailure(err)}`,
            );
            await sleep(text2ImageRetryDelayMs(providerInput, attempt));
            continue;
          }
          throw err;
        }
      }
      return [];
    } catch (err) {
      if (err instanceof Text2ImageTaskStillRunningError) throw err;
      const message = describeAxiosFailure(err);
      this.logger.error(
        `Text2image upstream failed via ${adapter.name}: ${message}; requestTimeoutMs=${requestTimeoutMs}; connectTimeoutMs=${connectTimeoutMs}`,
      );
      throw new Error(message);
    }
  }

  private async pollText2ImageTask({
    adapter,
    createUrl,
    input,
    initialResult,
    taskId,
  }: {
    adapter: ReturnType<typeof selectText2ImageAdapter>;
    createUrl: string;
    input: Text2ImageInput;
    initialResult: Text2ImageAdapterResult;
    taskId: string;
  }) {
    const statusUrl =
      initialResult.statusUrl ?? resolveText2ImageTaskUrl(createUrl, input, taskId);
    if (!statusUrl) {
      throw new Error(
        `Text2image provider returned async task ${taskId}, but no statusUrl is configured for apiStyle=${input.apiStyle ?? "OPENAI"}`,
      );
    }

    const initialProgress = normalizeProgress(
      progressForStatus(initialResult.status),
    );
    if (initialProgress !== undefined) {
      await input.onProgress?.(initialProgress, initialResult);
    }
    if (isFailureStatus(initialResult.status)) {
      throw new Error(
        text2ImageFailureMessage(
          initialResult.status,
          initialResult,
          initialResult.error,
        ) ?? "Image generation failed upstream",
      );
    }

    const attempts = Math.max(
      1,
      Math.min(10_000, Math.round(numberParam(input.params.pollAttempts, 180))),
    );
    const intervalMs = Math.max(
      1000,
      Math.min(60_000, Math.round(numberParam(input.params.pollIntervalMs, 5000))),
    );
    const maxPollDurationMs = Math.max(
      intervalMs,
      Math.min(
        24 * 60 * 60_000,
        Math.round(numberParam(input.params.maxPollDurationMs, 15 * 60_000)),
      ),
    );
    const pollStartedAt = Date.now();

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (Date.now() - pollStartedAt >= maxPollDurationMs) break;
      await sleep(intervalMs);
      let res: { data: unknown };
      try {
        res = await axios.get(statusUrl, {
          headers: adapter.pollHeaders?.(input) ?? videoPollHeaders(input.apiKey),
          timeout: 30_000,
        });
      } catch (err) {
        if (!isTransientTaskPollError(err)) {
          throw err;
        }
        const fallbackProgress = normalizeProgress(25 + attempt) ?? 25;
        await input.onProgress?.(Math.min(95, fallbackProgress), {
          retrying: true,
          error: describeAxiosFailure(err),
        });
        if (attempt === attempts - 1) {
          throw new Text2ImageTaskStillRunningError(
            taskId,
            `Image generation task ${taskId} status check is still pending: ${describeAxiosFailure(err)}`,
          );
        }
        continue;
      }
      const result = adapter.parseResponse(res.data, input);
      if (result.providerJobId) {
        await input.onProviderJobId?.(result.providerJobId, res.data);
      }
      const status = result.status ?? extractStatus(res.data);
      const progress = normalizeProgress(
        extractProgress(res.data) ?? progressForStatus(status),
      );
      if (progress !== undefined) {
        await input.onProgress?.(progress, res.data);
      }
      if (isFailureStatus(status)) {
        const providerError = result.error ?? extractProviderError(res.data);
        if (
          isRecoverableImageTaskFailure(providerError) &&
          attempt < attempts - 1
        ) {
          await input.onProgress?.(95, res.data);
          continue;
        }
        throw new Error(
          text2ImageFailureMessage(status, res.data, providerError) ??
            "Image generation failed upstream",
        );
      }
      if (result.items.length) {
        await input.onProgress?.(100, res.data);
        return withText2ImageProviderJobId(
          result.items,
          result.providerJobId ?? taskId,
        );
      }
      if (isSuccessStatus(status)) {
        await input.onProgress?.(95, res.data);
      }
    }

    throw new Text2ImageTaskStillRunningError(taskId);
  }

  async getText2ImageTaskResult(input: Text2ImageInput, taskId: string) {
    const providerInput = withDefaultAsyncText2ImageParams(
      input,
      selectText2ImageAdapter(input, {
        directProviderOrigins: parseDirectText2ImageOrigins(
          this.config.get<string>(DIRECT_TEXT2IMAGE_ORIGINS_ENV),
        ),
      }).name,
    );
    const adapter = selectText2ImageAdapter(providerInput, {
      directProviderOrigins: parseDirectText2ImageOrigins(
        this.config.get<string>(DIRECT_TEXT2IMAGE_ORIGINS_ENV),
      ),
    });
    const statusUrl = resolveText2ImageTaskUrlFromBase(providerInput, taskId);
    if (!statusUrl) return undefined;
    try {
      const res = await axios.get(statusUrl, {
        headers:
          adapter.pollHeaders?.(providerInput) ??
          videoPollHeaders(providerInput.apiKey),
        timeout: 30_000,
      });
      const result = adapter.parseResponse(res.data, providerInput);
      return {
        ...result,
        status: result.status ?? extractStatus(res.data),
        error: result.error ?? extractProviderError(res.data),
        statusUrl,
        raw: res.data,
      };
    } catch (err) {
      if (isTransientTaskPollError(err)) {
        throw new Text2ImageTaskStillRunningError(
          taskId,
          `Image generation task ${taskId} status could not be confirmed yet: ${describeAxiosFailure(err)}`,
        );
      }
      throw err;
    }
  }

  async getText2ImageTaskStatus(input: Text2ImageInput, taskId: string) {
    return (await this.getText2ImageTaskResult(input, taskId))?.status;
  }

  async image2video(input: VideoGenerationInput): Promise<GeneratedItem[]> {
    return this.videoGeneration(input);
  }

  async getVideoTaskResult(
    input: VideoGenerationInput,
    taskId: string,
  ): Promise<VideoTaskResult | undefined> {
    if (!input.apiKey) {
      throw new Error("AI model API token is not configured");
    }
    const params = input.params ?? {};
    const apiStyle = inferVideoApiStyle(input.baseUrl, params);
    const createUrl = resolveVideoCreateUrl(input.baseUrl, params, apiStyle);
    const statusUrl = resolveVideoStatusUrl(createUrl, params, apiStyle, taskId);
    if (!statusUrl) return undefined;
    const res = await axios.get(statusUrl, {
      headers: videoPollHeaders(input.apiKey),
      timeout: 30_000,
    });
    return parseVideoTaskResult(res.data, taskId);
  }

  async listVideoTasks(
    input: VideoGenerationInput,
    query: {
      pageNum?: number;
      pageSize?: number;
      status?: string;
      taskIds?: string[];
      model?: string;
      serviceTier?: string;
    } = {},
  ): Promise<VideoTaskListResult> {
    if (!input.apiKey) {
      throw new Error("AI model API token is not configured");
    }
    const params = input.params ?? {};
    const apiStyle = inferVideoApiStyle(input.baseUrl, params);
    const createUrl = resolveVideoCreateUrl(input.baseUrl, params, apiStyle);
    if (apiStyle !== "volcengine-video") {
      throw new Error(`Video task list is not supported for apiStyle=${apiStyle}`);
    }
    const listUrl = resolveVolcengineVideoTaskListUrl(createUrl, params, query);
    const res = await axios.get(listUrl, {
      headers: videoPollHeaders(input.apiKey),
      timeout: 30_000,
    });
    const items = extractVideoTaskItems(res.data).map((item) =>
      parseVideoTaskResult(item),
    );
    return {
      items,
      total: extractVideoTaskTotal(res.data) || items.length,
      raw: res.data,
    };
  }

  async deleteVideoTask(
    input: VideoGenerationInput,
    taskId: string,
    currentStatus?: string,
  ): Promise<VideoTaskDeleteResult> {
    if (!input.apiKey) {
      throw new Error("AI model API token is not configured");
    }
    const params = input.params ?? {};
    const apiStyle = inferVideoApiStyle(input.baseUrl, params);
    const createUrl = resolveVideoCreateUrl(input.baseUrl, params, apiStyle);
    if (apiStyle !== "volcengine-video") {
      throw new Error(`Video task delete is not supported for apiStyle=${apiStyle}`);
    }
    const status = normalizeStatus(currentStatus);
    if (status === "running") {
      return {
        providerJobId: taskId,
        previousStatus: status,
        action: "unsupported",
      };
    }
    const deleteUrl = resolveVolcengineVideoTaskUrl(createUrl, params, taskId);
    try {
      const res = await axios.delete(deleteUrl, {
        headers: videoPollHeaders(input.apiKey),
        timeout: 30_000,
      });
      return {
        providerJobId: taskId,
        previousStatus: status,
        action: status === "queued" ? "cancelled" : "deleted",
        raw: res.data,
      };
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        return {
          providerJobId: taskId,
          previousStatus: status,
          action: "not_found",
          raw: err.response.data,
        };
      }
      throw err;
    }
  }

  async materialize(
    item: GeneratedItem,
    fallbackContentType: string,
  ): Promise<GeneratedItem> {
    if (item.bytes || !item.url || !/^https?:\/\//i.test(item.url)) return item;
    const urls = [
      ...new Set(
        [item.url, item.fallbackUrl].filter((url): url is string =>
          Boolean(url),
        ),
      ),
    ];
    let lastError: unknown;
    for (const url of urls) {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          const res = await axios.get<ArrayBuffer>(url, {
            responseType: "arraybuffer",
            timeout: 120_000,
          });
          return {
            bytes: Buffer.from(res.data),
            contentType: String(
              res.headers["content-type"] ?? fallbackContentType,
            ),
            url,
          };
        } catch (err) {
          lastError = err;
          if (!isTransientDownloadError(err) || attempt === 5) break;
          await sleep(1000 * (attempt + 1));
        }
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Unable to download generated output");
  }

  private async videoGeneration(
    input: VideoGenerationInput,
  ): Promise<GeneratedItem[]> {
    if (!input.apiKey) {
      throw new Error("AI model API token is not configured");
    }

    const params = input.params ?? {};
    const apiStyle = inferVideoApiStyle(input.baseUrl, params);
    const createUrl = resolveVideoCreateUrl(input.baseUrl, params, apiStyle);
    const payload = buildVideoPayload(input, apiStyle);
    const expectsStream = payload.stream === true;
    const existingProviderJobId = stringParam(input.existingProviderJobId);

    if (existingProviderJobId) {
      await input.onProviderJobId?.(existingProviderJobId);
      return this.pollVideoTask(
        existingProviderJobId,
        createUrl,
        params,
        apiStyle,
        input.apiKey,
        input.onProgress,
      );
    }

    try {
      const res = await axios.post(createUrl, payload, {
        headers: videoRequestHeaders(input.apiKey, createUrl),
        ...(expectsStream ? { responseType: "stream" as const } : {}),
        timeout: expectsStream ? 20 * 60_000 : 120_000,
      });
      const streamResult = expectsStream
        ? await readSsePayloads(res.data as NodeJS.ReadableStream)
        : null;
      const streamPayload = streamResult
        ? responseFromStreamPayloads(streamResult.payloads)
        : res.data;
      const immediateUrls = extractVideoUrls(streamPayload);
      if (immediateUrls.length)
        return immediateUrls.map((url) => ({
          url,
          contentType: "video/mp4",
          requireOssPersistence: apiStyle === "dpi-chat-completions",
        }));

      if (streamResult?.error) {
        throw streamResult.error;
      }

      if (expectsStream) {
        this.logger.warn(
          `Video upstream returned no final video URL in stream: ${JSON.stringify(streamPayload).slice(0, 400)}`,
        );
        return [];
      }

      const taskId = extractTaskId(res.data);
      if (!taskId) {
        this.logger.warn(
          `Video upstream returned no task id or video URL: ${JSON.stringify(res.data).slice(0, 400)}`,
        );
        return [];
      }
      await input.onProviderJobId?.(taskId, res.data);

      return this.pollVideoTask(
        taskId,
        createUrl,
        params,
        apiStyle,
        input.apiKey,
        input.onProgress,
      );
    } catch (err) {
      const message = describeAxiosFailure(err);
      this.logger.error(`Video upstream failed: ${message}`);
      throw new Error(message);
    }
  }

  private async pollVideoTask(
    taskId: string,
    createUrl: string,
    params: Record<string, unknown>,
    apiStyle: string,
    apiKey: string,
    onProgress?: VideoGenerationInput["onProgress"],
  ) {
    const statusUrl = resolveVideoStatusUrl(
      createUrl,
      params,
      apiStyle,
      taskId,
    );
    if (!statusUrl) return [];

    const attempts = Math.max(
      1,
      Math.min(10_000, Math.round(numberParam(params.pollAttempts, 72))),
    );
    const intervalMs = Math.max(
      1000,
      Math.min(60_000, Math.round(numberParam(params.pollIntervalMs, 5000))),
    );
    const maxPollDurationMs = Math.max(
      intervalMs,
      Math.min(
        24 * 60 * 60_000,
        Math.round(
          numberParam(params.maxPollDurationMs, attempts * intervalMs),
        ),
      ),
    );
    const pollStartedAt = Date.now();

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (Date.now() - pollStartedAt >= maxPollDurationMs) break;
      await sleep(intervalMs);
      const res = await axios.get(statusUrl, {
        headers: videoPollHeaders(apiKey),
        timeout: 30_000,
      });
      const task = parseVideoTaskResult(res.data, taskId);
      const status = task.status;
      const progress = normalizeProgress(
        extractProgress(res.data) ?? progressForStatus(status),
      );
      if (progress !== undefined) {
        await onProgress?.(progress, res.data);
      }
      if (isFailureStatus(status)) {
        throw new Error(
          task.error ??
            `Video generation failed with status ${status}`,
        );
      }
      if (task.items.length) {
        return task.items;
      }
      if (isSuccessStatus(status)) {
        const contentUrl = resolveVideoContentUrl(createUrl, params, taskId);
        if (contentUrl) {
          const content = await axios.get<ArrayBuffer>(contentUrl, {
            headers: videoPollHeaders(apiKey),
            responseType: "arraybuffer",
            timeout: 120_000,
          });
          return [
            {
              bytes: Buffer.from(content.data),
              contentType: String(
                content.headers["content-type"] ?? "video/mp4",
              ),
              url: contentUrl,
              requireOssPersistence: true,
            },
          ];
        }
        return [];
      }
    }

    throw new Error(`Video generation timed out while polling task ${taskId}`);
  }
}
