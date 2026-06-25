import type {
  GeneratedItem,
  GeneratedOutputPersistence,
} from "./generation-provider.types";

export const DIRECT_TEXT2IMAGE_ORIGINS_ENV =
  "GENERATION_DIRECT_TEXT2IMAGE_ORIGINS";

export interface Text2ImageInput {
  apiKey: string;
  baseUrl: string;
  apiStyle?: "OPENAI" | "CREX" | "VOLCENGINE";
  statusUrl?: string | null;
  modelName: string;
  prompt: string;
  params: Record<string, unknown>;
  existingProviderJobId?: string;
  onProviderJobId?: (
    providerJobId: string,
    payload?: unknown,
  ) => Promise<void> | void;
  onProgress?: (progress: number, payload?: unknown) => Promise<void> | void;
}

interface Text2ImageAdapterConfig {
  directProviderOrigins: string[];
}

export interface Text2ImageAdapterResult {
  items: GeneratedItem[];
  providerJobId?: string;
  statusUrl?: string;
  status?: string;
  error?: string;
}

interface Text2ImageAdapter {
  name: string;
  matches(input: Text2ImageInput, config: Text2ImageAdapterConfig): boolean;
  resolveUrl(input: Text2ImageInput): string;
  buildPayload(input: Text2ImageInput): Record<string, unknown>;
  requestHeaders?(input: Text2ImageInput): Record<string, string>;
  pollHeaders?(input: Text2ImageInput): Record<string, string>;
  debugPayload?(payload: Record<string, unknown>): Record<string, unknown>;
  parseResponse(
    payload: unknown,
    input: Text2ImageInput,
  ): Text2ImageAdapterResult;
  parseStreamPayloads?(
    payloads: unknown[],
    input: Text2ImageInput,
  ): Text2ImageAdapterResult;
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function boolParam(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return undefined;
}

function intParam(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : undefined;
}

function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function appendPath(baseUrl: string, path: string) {
  return `${normalizeBaseUrl(baseUrl)}/${path.replace(/^\/+/, "")}`;
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

function normalizeOrigin(value: string) {
  const raw = value.trim().replace(/\/+$/, "");
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.origin.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function originForUrl(value: string) {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return null;
  }
}

function isFullText2ImageEndpoint(baseUrl: string) {
  return /\/images\/generations\/?$/i.test(baseUrl.trim());
}

function isFullImageEditEndpoint(baseUrl: string) {
  return /\/images\/edits\/?$/i.test(baseUrl.trim());
}

function isFullChatCompletionsEndpoint(baseUrl: string) {
  return /\/chat\/completions\/?$/i.test(baseUrl.trim());
}

function resolveText2ImageUrl(baseUrl: string) {
  if (isFullText2ImageEndpoint(baseUrl)) return normalizeBaseUrl(baseUrl);

  const normalized = normalizeBaseUrl(baseUrl);
  try {
    const parsed = new URL(normalized);
    const path = parsed.pathname.replace(/\/+$/, "");
    if (!path || path === "/") {
      return appendPath(normalized, "/v1/images/generations");
    }
  } catch {
    // Fall through to the OpenAI-compatible path append.
  }

  return appendPath(normalized, "/images/generations");
}

function resolveVolcengineSeedreamUrl(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (/\/api\/v3\/images\/generations\/?$/i.test(normalized)) {
    return normalized;
  }
  try {
    const parsed = new URL(normalized);
    const path = parsed.pathname.replace(/\/+$/, "");
    parsed.pathname = path.endsWith("/api/v3")
      ? `${path}/images/generations`
      : `${path}/api/v3/images/generations`;
    parsed.search = "";
    return parsed.toString();
  } catch {
    return appendPath(normalized, "/api/v3/images/generations");
  }
}

function resolveImageEditUrl(baseUrl: string) {
  if (isFullImageEditEndpoint(baseUrl)) return normalizeBaseUrl(baseUrl);

  const normalized = normalizeBaseUrl(baseUrl);
  try {
    const parsed = new URL(normalized);
    const path = parsed.pathname.replace(/\/+$/, "");
    if (!path || path === "/") {
      return appendPath(normalized, "/v1/images/edits");
    }
    if (path === "/v1") {
      return appendPath(normalized, "/images/edits");
    }
  } catch {
    // Fall through to the OpenAI-compatible edit path append.
  }

  return appendPath(normalized, "/images/edits");
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

function resolveImageUrl(rawUrl: string | undefined, baseUrl: string) {
  const trimmed = rawUrl?.trim() ?? "";
  if (!trimmed) return undefined;
  if (/^(data:|blob:|https?:\/\/)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;

  const origin = originForUrl(baseUrl);
  if (!origin) return trimmed;
  if (trimmed.startsWith("/")) return `${origin}${trimmed}`;
  return `${origin}/${trimmed}`;
}

function preferOriginalImageUrl(rawUrl: string | undefined) {
  if (!rawUrl) return undefined;
  try {
    const url = new URL(rawUrl);
    url.searchParams.delete("thumb_kb");
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function contentTypeFromFormat(format: unknown) {
  if (
    format !== "jpeg" &&
    format !== "jpg" &&
    format !== "webp" &&
    format !== "png"
  ) {
    return "image/png";
  }
  return `image/${format === "jpg" ? "jpeg" : format}`;
}

function normalizeCompression(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function imageReferenceArray(params: Record<string, unknown>) {
  return [
    ...stringArray(params.reference_images),
    ...stringArray(params.referenceImages),
    ...stringArray(params.image_urls),
    ...stringArray(params.imageUrls),
    ...stringArray(params.images),
    ...(typeof params.reference_image === "string"
      ? [params.reference_image]
      : []),
    ...(typeof params.referenceImage === "string"
      ? [params.referenceImage]
      : []),
    ...(typeof params.image === "string" ? [params.image] : []),
    ...(typeof params.image_url === "string" ? [params.image_url] : []),
    ...(typeof params.imageUrl === "string" ? [params.imageUrl] : []),
    ...(typeof params.input_reference === "string"
      ? [params.input_reference]
      : []),
  ].filter(
    (item, index, items) => item.trim() && items.indexOf(item) === index,
  );
}

function firstImageReference(params: Record<string, unknown>) {
  return (
    stringParam(params.input_image) ??
    stringParam(params.inputImage) ??
    stringParam(params.image) ??
    stringParam(params.image_url) ??
    stringParam(params.imageUrl) ??
    imageReferenceArray(params)[0]
  );
}

function maskReference(params: Record<string, unknown>) {
  return (
    stringParam(params.mask) ??
    stringParam(params.mask_url) ??
    stringParam(params.maskUrl)
  );
}

function dataUrlItem(url: string) {
  const match = url.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  return {
    bytes: Buffer.from(match[2], "base64"),
    contentType: match[1],
    persistence: "project-oss" as const,
  };
}

function extractChatCompletionContent(payload: Record<string, unknown>) {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const contents: string[] = [];
  for (const rawChoice of choices) {
    const choice = asRecord(rawChoice);
    const message = asRecord(choice.message);
    const content = stringParam(message.content);
    if (content) contents.push(content);
  }
  return contents;
}

function extractMarkdownImageUrls(content: string) {
  const matches = [...content.matchAll(/!\[[^\]]*]\((.*?)\)/g)];
  return matches
    .map((match) => match[1]?.trim())
    .filter((item): item is string => Boolean(item));
}

function buildOpenAiCompatiblePayload(input: Text2ImageInput) {
  const outputCompression = normalizeCompression(
    input.params.output_compression,
  );
  const referenceImages = imageReferenceArray(input.params);
  const waitForResult = input.params.wait_for_result ?? input.params.waitForResult;
  const sendAsyncControls = shouldSendAsyncControls(input);
  return {
    prompt: input.prompt,
    model: input.modelName,
    n: input.params.n ?? 1,
    size: input.params.size ?? "1024x1024",
    ...(sendAsyncControls && typeof input.params.async === "boolean"
      ? { async: input.params.async }
      : {}),
    ...(sendAsyncControls && typeof waitForResult === "boolean"
      ? { wait_for_result: waitForResult }
      : {}),
    ...(typeof input.params.quality === "string"
      ? { quality: input.params.quality }
      : {}),
    ...(typeof input.params.output_format === "string"
      ? { output_format: input.params.output_format }
      : {}),
    ...(typeof input.params.response_format === "string"
      ? { response_format: input.params.response_format }
      : {}),
    ...(outputCompression !== undefined
      ? { output_compression: outputCompression }
      : {}),
    ...(typeof input.params.upscale === "string"
      ? { upscale: input.params.upscale }
      : {}),
    ...(referenceImages.length ? { reference_images: referenceImages } : {}),
  };
}

function isCrexText2ImageProvider(input: Text2ImageInput) {
  const configured = stringParam(input.params.apiStyle ?? input.params.provider);
  if (configured) {
    return ["CREX", "crex", "bpi", "gpt2api", "chatgpt2api"].includes(configured);
  }
  return input.apiStyle === "CREX";
}

function isMagickApiText2ImageProvider(input: Text2ImageInput) {
  const configured = stringParam(input.params.apiStyle ?? input.params.provider)?.toLowerCase();
  if (configured === "magickapi" || configured === "magick-api") return true;
  return input.baseUrl.toLowerCase().includes("magickapi.com");
}

function shouldSendAsyncControls(input: Text2ImageInput) {
  return (
    isCrexText2ImageProvider(input) ||
    Boolean(input.statusUrl) ||
    Boolean(
      stringParam(
        input.params.statusUrl ??
          input.params.pollUrl ??
          input.params.taskUrl ??
          input.params.imageTaskStatusUrl,
      ),
    )
  );
}

function buildCrexText2ImagePayload(input: Text2ImageInput) {
  return {
    ...buildOpenAiCompatiblePayload({
      ...input,
      params: {
        ...input.params,
        async: true,
        wait_for_result: false,
      },
    }),
    async: true,
    wait_for_result: false,
  };
}

function buildMagickApiText2ImagePayload(input: Text2ImageInput) {
  const referenceImages = imageReferenceArray(input.params);
  return {
    ...extraImageProviderParams(input.params),
    model: input.modelName,
    prompt: input.prompt,
    n: input.params.n ?? 1,
    size: input.params.size ?? "1024x1024",
    ...(typeof input.params.quality === "string"
      ? { quality: input.params.quality }
      : {}),
    ...(typeof input.params.output_format === "string"
      ? { output_format: input.params.output_format }
      : {}),
    ...(typeof input.params.response_format === "string"
      ? { response_format: input.params.response_format }
      : {}),
    ...(referenceImages.length ? { image_urls: referenceImages } : {}),
    ...(referenceImages[0]
      ? { image: referenceImages[0], input_reference: referenceImages[0] }
      : {}),
  };
}

function isDpiChatCompletionsProvider(input: Text2ImageInput) {
  const configured = stringParam(input.params.apiStyle ?? input.params.provider);
  if (
    configured === "dpi-chat-completions" ||
    configured === "dpi" ||
    configured === "flow2api-chat-completions"
  ) {
    return true;
  }

  if (input.apiStyle === "CREX") return false;
  const origin = originForUrl(input.baseUrl);
  return origin === "https://dpi.crex.cn";
}

function buildDpiChatCompletionsPayload(input: Text2ImageInput) {
  const referenceImages = imageReferenceArray(input.params);
  const content = [
    { type: "text", text: input.prompt },
    ...referenceImages.map((url) => ({
      type: "image_url",
      image_url: { url },
    })),
  ];

  return {
    model: input.modelName,
    messages: [
      {
        role: "user",
        content: referenceImages.length ? content : input.prompt,
      },
    ],
    stream: true,
  };
}

function isVolcengineSeedreamModel(modelName: string | undefined) {
  return /doubao-seedream-(?:5(?:[.-]0)?(?:-lite)?|4[.-][05])/i.test(
    modelName?.trim() ?? "",
  );
}

function isVolcengineSeedreamProvider(input: Text2ImageInput) {
  const configured = stringParam(input.params.apiStyle ?? input.params.provider);
  if (
    configured === "volcengine-seedream" ||
    configured === "seedream" ||
    configured === "ark-images-generations"
  ) {
    return true;
  }
  return input.apiStyle === "VOLCENGINE" && isVolcengineSeedreamModel(input.modelName);
}

function seedreamModelFamily(modelName: string) {
  const normalized = modelName.toLowerCase();
  if (normalized.includes("5.0") || normalized.includes("5-0")) return "5.0";
  if (normalized.includes("4.5") || normalized.includes("4-5")) return "4.5";
  if (normalized.includes("4.0") || normalized.includes("4-0")) return "4.0";
  return undefined;
}

const SEEDREAM_2K_SIZES: Record<string, string> = {
  "1:1": "2048x2048",
  "4:3": "2304x1728",
  "3:4": "1728x2304",
  "16:9": "2848x1600",
  "9:16": "1600x2848",
  "3:2": "2496x1664",
  "2:3": "1664x2496",
  "21:9": "3136x1344",
};

const SEEDREAM_1K_SIZES: Record<string, string> = {
  "1:1": "1024x1024",
  "4:3": "1152x864",
  "3:4": "864x1152",
  "16:9": "1280x720",
  "9:16": "720x1280",
  "3:2": "1248x832",
  "2:3": "832x1248",
  "21:9": "1512x648",
};

const SEEDREAM_RATIO_VALUES: Record<string, number> = {
  "1:1": 1,
  "4:3": 4 / 3,
  "3:4": 3 / 4,
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "3:2": 3 / 2,
  "2:3": 2 / 3,
  "21:9": 21 / 9,
};

const SEEDREAM_DEFAULT_STREAM = false;

function seedreamProfile(modelName: string) {
  return seedreamModelFamily(modelName) ?? "5.0";
}

function parsePixelSize(value: string | undefined) {
  const match = value?.trim().match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (!match) return undefined;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }
  return { width, height };
}

function seedreamResolutionForProfile(
  raw: string | undefined,
  profile: string,
) {
  const normalized = raw?.trim().toUpperCase();
  if (!normalized || !/^[1-4]K$/.test(normalized)) return undefined;
  if ((profile === "5.0" || profile === "4.5") && normalized === "1K") {
    return "2K";
  }
  if (profile === "4.5" && normalized === "3K") return "2K";
  return normalized;
}

function seedreamMinPixels(profile: string) {
  return profile === "4.0" ? 1280 * 720 : 2560 * 1440;
}

function isValidSeedreamPixelSize(value: string | undefined, profile: string) {
  const parsed = parsePixelSize(value);
  if (!parsed) return false;
  const pixels = parsed.width * parsed.height;
  const ratio = parsed.width / parsed.height;
  return (
    pixels >= seedreamMinPixels(profile) &&
    pixels <= 4096 * 4096 &&
    ratio >= 1 / 16 &&
    ratio <= 16
  );
}

function seedreamRatioKey(input: Text2ImageInput, fallbackSize?: string) {
  const explicit = stringParam(
    input.params.ratio ?? input.params.aspectRatio ?? input.params.aspect_ratio,
  );
  if (explicit && SEEDREAM_RATIO_VALUES[explicit]) return explicit;

  const parsed = parsePixelSize(fallbackSize);
  if (!parsed) return "1:1";
  const ratio = parsed.width / parsed.height;
  return Object.entries(SEEDREAM_RATIO_VALUES).reduce(
    (best, [key, value]) => {
      const distance = Math.abs(ratio - value);
      return distance < best.distance ? { key, distance } : best;
    },
    { key: "1:1", distance: Number.POSITIVE_INFINITY },
  ).key;
}

function seedreamRecommendedSize(input: Text2ImageInput, profile: string, fallbackSize?: string) {
  const ratioKey = seedreamRatioKey(input, fallbackSize);
  const table = profile === "4.0" ? SEEDREAM_1K_SIZES : SEEDREAM_2K_SIZES;
  return table[ratioKey] ?? table["1:1"];
}

function seedreamSizeParam(input: Text2ImageInput) {
  const profile = seedreamProfile(input.modelName);
  const size = stringParam(input.params.size);
  const explicitRatio = stringParam(
    input.params.ratio ?? input.params.aspectRatio ?? input.params.aspect_ratio,
  );
  if (explicitRatio && SEEDREAM_RATIO_VALUES[explicitRatio]) {
    return seedreamRecommendedSize(input, profile, size);
  }

  const sizeResolution = seedreamResolutionForProfile(size, profile);
  if (sizeResolution) return sizeResolution;
  if (size && isValidSeedreamPixelSize(size, profile)) return size;
  if (size) return seedreamRecommendedSize(input, profile, size);

  const resolution = stringParam(input.params.resolution);
  const normalizedResolution = seedreamResolutionForProfile(resolution, profile);
  if (normalizedResolution) return normalizedResolution;
  return seedreamRecommendedSize(input, profile);
}

function normalizeSeedreamMaxImages(
  input: Text2ImageInput,
  referenceCount: number,
) {
  const options = asRecord(input.params.sequential_image_generation_options);
  const camelOptions = asRecord(input.params.sequentialImageGenerationOptions);
  const explicit =
    intParam(options.max_images) ??
    intParam(camelOptions.maxImages) ??
    intParam(input.params.max_images) ??
    intParam(input.params.maxImages) ??
    intParam(input.params.n);
  if (explicit === undefined) return undefined;
  return Math.max(1, Math.min(15 - referenceCount, Math.min(15, explicit)));
}

function normalizeSeedreamSequentialMode(input: Text2ImageInput) {
  const requestedCount = intParam(input.params.n) ?? 1;
  if (requestedCount > 1) return "auto";
  const raw = stringParam(
    input.params.sequential_image_generation ??
      input.params.sequentialImageGeneration,
  );
  return raw === "auto" ? "auto" : "disabled";
}

function buildVolcengineSeedreamPayload(input: Text2ImageInput) {
  const referenceImages = imageReferenceArray(input.params).slice(0, 14);
  const sequentialImageGeneration = normalizeSeedreamSequentialMode(input);
  const maxImages = normalizeSeedreamMaxImages(input, referenceImages.length);
  const optimizePromptOptions = asRecord(input.params.optimize_prompt_options);
  const camelOptimizePromptOptions = asRecord(input.params.optimizePromptOptions);
  const tools =
    Array.isArray(input.params.tools) && input.params.tools.length
      ? input.params.tools
      : boolParam(input.params.web_search ?? input.params.webSearch) === true
        ? [{ type: "web_search" }]
        : undefined;
  const family = seedreamModelFamily(input.modelName);
  const outputFormat = stringParam(input.params.output_format);
  const stream = boolParam(input.params.stream) ?? SEEDREAM_DEFAULT_STREAM;

  return {
    ...extraSeedreamProviderParams(input.params),
    model: input.modelName,
    prompt: input.prompt,
    ...(referenceImages.length
      ? { image: referenceImages.length === 1 ? referenceImages[0] : referenceImages }
      : {}),
    size: seedreamSizeParam(input),
    sequential_image_generation: sequentialImageGeneration,
    ...(sequentialImageGeneration === "auto" && maxImages !== undefined
      ? { sequential_image_generation_options: { max_images: maxImages } }
      : {}),
    ...(tools ? { tools } : {}),
    stream,
    ...(outputFormat && family === "5.0" ? { output_format: outputFormat } : {}),
    ...(typeof input.params.response_format === "string"
      ? { response_format: input.params.response_format }
      : {}),
    ...(typeof input.params.watermark === "boolean"
      ? { watermark: input.params.watermark }
      : {}),
    ...(Object.keys(optimizePromptOptions).length
      ? { optimize_prompt_options: optimizePromptOptions }
      : Object.keys(camelOptimizePromptOptions).length
        ? {
            optimize_prompt_options: {
              ...(stringParam(camelOptimizePromptOptions.mode)
                ? { mode: stringParam(camelOptimizePromptOptions.mode) }
                : camelOptimizePromptOptions),
            },
          }
        : {}),
  };
}

const BFL_MODEL_FLUX_1_FILL_ALIAS = "flux_1_fill";
const BFL_MODEL_FLUX_PRO_10_FILL = "flux-pro-1.0-fill";
const BFL_MODEL_FLUX_ERASE = "flux-erase";
const BFL_MODEL_FLUX_TOOLS_ERASE_V1 = "flux-tools-erase-v1";
const BFL_ENDPOINT_FLUX_TOOLS_ERASE_V1 = "flux-tools/erase-v1";

function bflConfiguredStyle(input: Text2ImageInput) {
  return stringParam(input.params.apiStyle ?? input.params.provider);
}

function bflRequestedModel(input: Text2ImageInput) {
  return stringParam(input.params.requestModelName) ?? input.modelName;
}

function isBflEraseModel(modelName: string | undefined) {
  const normalized = modelName?.trim();
  return (
    normalized === BFL_MODEL_FLUX_ERASE ||
    normalized === BFL_MODEL_FLUX_TOOLS_ERASE_V1 ||
    normalized === BFL_ENDPOINT_FLUX_TOOLS_ERASE_V1
  );
}

function canonicalBflGatewayModel(modelName: string | undefined) {
  const normalized = modelName?.trim();
  if (!normalized || normalized === BFL_MODEL_FLUX_1_FILL_ALIAS) {
    return BFL_MODEL_FLUX_PRO_10_FILL;
  }
  if (normalized === BFL_ENDPOINT_FLUX_TOOLS_ERASE_V1) {
    return BFL_MODEL_FLUX_ERASE;
  }
  return normalized;
}

function bflEndpointModel(modelName: string | undefined) {
  const normalized = modelName?.trim();
  if (!normalized || normalized === BFL_MODEL_FLUX_1_FILL_ALIAS) {
    return BFL_MODEL_FLUX_PRO_10_FILL;
  }
  if (
    normalized === BFL_MODEL_FLUX_ERASE ||
    normalized === BFL_MODEL_FLUX_TOOLS_ERASE_V1
  ) {
    return BFL_ENDPOINT_FLUX_TOOLS_ERASE_V1;
  }
  return normalized;
}

function isDirectBflProvider(input: Text2ImageInput) {
  const configured = bflConfiguredStyle(input)?.toLowerCase();
  if (configured === "bfl-direct" || configured === "bfl-official") {
    return true;
  }
  const origin = originForUrl(input.baseUrl);
  return Boolean(origin && /\.?bfl\.ai$/i.test(new URL(origin).hostname));
}

function bflAuthHeaders(input: Text2ImageInput) {
  return {
    "x-key": input.apiKey.trim().replace(/^Bearer\s+/i, "").trim(),
    Accept: "application/json",
  };
}

function bearerJsonHeaders(input: Text2ImageInput) {
  return {
    Authorization: `Bearer ${input.apiKey.trim().replace(/^Bearer\s+/i, "").trim()}`,
    "Content-Type": "application/json",
  };
}

function bearerPollHeaders(input: Text2ImageInput) {
  return {
    Authorization: `Bearer ${input.apiKey.trim().replace(/^Bearer\s+/i, "").trim()}`,
  };
}

function buildBflImageEditPayload(input: Text2ImageInput) {
  const image = firstImageReference(input.params);
  const mask = maskReference(input.params);
  const requestedModel = bflRequestedModel(input);
  const erase = isBflEraseModel(requestedModel);
  const common = {
    ...extraImageProviderParams(input.params),
    ...(typeof input.params.output_format === "string"
      ? { output_format: input.params.output_format }
      : {}),
    image,
    ...(mask ? { mask } : {}),
  };
  if (isDirectBflProvider(input)) {
    return {
      ...common,
      ...(erase ? {} : { prompt: input.prompt }),
    };
  }
  return {
    ...common,
    model: canonicalBflGatewayModel(requestedModel),
    prompt: erase ? "" : input.prompt,
    ...(typeof input.params.response_format === "string"
      ? { response_format: input.params.response_format }
      : {}),
  };
}

function buildFlux2EditPayload(input: Text2ImageInput) {
  const image = firstImageReference(input.params);
  return {
    ...extraImageProviderParams(input.params),
    model: stringParam(input.params.requestModelName) ?? input.modelName,
    prompt: input.prompt,
    ...(image ? { input_image: image } : {}),
  };
}

const IMAGE_CONTROL_PARAMS = new Set([
  "apiStyle",
  "provider",
  "createUrl",
  "endpoint",
  "endpointPath",
  "taskUrl",
  "imageTaskUrl",
  "imageTaskStatusUrl",
  "statusUrl",
  "pollUrl",
  "pollAttempts",
  "pollIntervalMs",
  "maxPollDurationMs",
  "requestTimeoutMs",
  "requestModelName",
  "input_image",
  "inputImage",
  "image",
  "image_urls",
  "imageUrls",
  "images",
  "input_reference",
  "image_url",
  "imageUrl",
  "mask",
  "mask_url",
  "maskUrl",
  "reference_images",
  "referenceImages",
  "reference_media_ids",
  "referenceMediaIds",
  "reference_image",
  "referenceImage",
  "n",
  "size",
  "quality",
  "response_format",
  "output_compression",
  "modeCode",
  "modeName",
  "requiresMask",
  "maskRequired",
  "promptRequired",
  "defaultPrompt",
  "fields",
  "maxInputMegapixels",
  "maxInputSide",
  "normalizeMask",
  "async",
  "wait_for_result",
  "waitForResult",
  "preserveReferenceImageUrls",
]);

const SEEDREAM_CONTROL_PARAMS = new Set([
  ...IMAGE_CONTROL_PARAMS,
  "imageInputMode",
  "minReferenceImages",
  "maxReferenceImages",
  "resolution",
  "ratio",
  "aspectRatio",
  "aspect_ratio",
  "output_format",
  "outputFormat",
  "stream",
  "watermark",
  "sequential_image_generation",
  "sequentialImageGeneration",
  "sequential_image_generation_options",
  "sequentialImageGenerationOptions",
  "max_images",
  "maxImages",
  "tools",
  "web_search",
  "webSearch",
  "optimize_prompt_options",
  "optimizePromptOptions",
  "guidance_scale",
  "guidanceScale",
  "seed",
]);

function extraImageProviderParams(params: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([key, value]) => !IMAGE_CONTROL_PARAMS.has(key) && value !== undefined,
    ),
  );
}

function extraSeedreamProviderParams(params: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(params).filter(
      ([key, value]) => !SEEDREAM_CONTROL_PARAMS.has(key) && value !== undefined,
    ),
  );
}

function isBflImageEditProvider(input: Text2ImageInput) {
  const configured = bflConfiguredStyle(input);
  if (
    configured === "bfl-fill" ||
    configured === "bfl-erase" ||
    configured === "bfl-image-edit"
  ) {
    return true;
  }
  const requestedModel = bflRequestedModel(input);
  return /fill|erase/i.test(requestedModel);
}

function isFlux2EditProvider(input: Text2ImageInput) {
  const configured = stringParam(input.params.apiStyle ?? input.params.provider);
  return configured === "flux2-edit" || /flux-2/i.test(input.modelName);
}

function resolveBflImageEditCreateUrl(input: Text2ImageInput) {
  const configured = stringParam(
    input.params.createUrl ?? input.params.endpoint ?? input.params.endpointPath,
  );
  if (configured) {
    return /^https?:\/\//i.test(configured)
      ? configured
      : appendPath(input.baseUrl, configured);
  }
  if (isDirectBflProvider(input)) {
    return appendV1Path(input.baseUrl, bflEndpointModel(bflRequestedModel(input)));
  }
  return resolveImageEditUrl(input.baseUrl);
}

function resolveFlux2EditCreateUrl(input: Text2ImageInput) {
  const configured = stringParam(
    input.params.createUrl ?? input.params.endpoint ?? input.params.endpointPath,
  );
  if (configured) {
    return /^https?:\/\//i.test(configured)
      ? configured
      : appendPath(input.baseUrl, configured);
  }
  return resolveImageEditUrl(input.baseUrl);
}

function providerJobIdFrom(payload: Record<string, unknown>) {
  const value = payload.task_id ?? payload.taskId ?? payload.id;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function statusFrom(payload: Record<string, unknown>) {
  const value =
    payload.status ?? payload.state ?? payload.taskStatus ?? payload.task_status;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function errorFrom(payload: Record<string, unknown>) {
  const value =
    payload.error ??
    payload.error_message ??
    payload.errorMessage ??
    payload.message ??
    payload.reason;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const nested = value as Record<string, unknown>;
  return stringParam(
    nested.message ??
      nested.detail ??
      nested.reason ??
      nested.error_message ??
      nested.errorMessage ??
      nested.code,
  );
}

function parseOpenAiCompatibleResponse(
  payload: unknown,
  input: Text2ImageInput,
  persistence: GeneratedOutputPersistence,
): Text2ImageAdapterResult {
  const record = asRecord(payload);
  const providerJobId = providerJobIdFrom(record);
  const status = statusFrom(record);
  const error = errorFrom(record);
  const rawItems = Array.isArray(record.data) ? record.data : [];

  const items = rawItems
    .map((raw): GeneratedItem | null => {
      const item = typeof raw === "string" ? { url: raw } : asRecord(raw);
      const b64Json = stringParam(item.b64_json);
      const fileId = stringParam(item.file_id ?? item.fileId);
      if (b64Json) {
        return {
          bytes: Buffer.from(b64Json, "base64"),
          contentType: contentTypeFromFormat(
            item.output_format ?? input.params.output_format,
          ),
          persistence: "project-oss",
          providerFileId: fileId,
          providerJobId,
        };
      }

      const resolved = resolveImageUrl(stringParam(item.url), input.baseUrl);
      const original = preferOriginalImageUrl(resolved);
      if (!original) return null;

      return {
        url: original,
        fallbackUrl:
          original && resolved && original !== resolved ? resolved : undefined,
        contentType: contentTypeFromFormat(
          item.output_format ?? input.params.output_format,
        ),
        persistence,
        providerFileId: fileId,
        providerJobId,
      };
    })
    .filter((item): item is GeneratedItem => Boolean(item));

  return { items, providerJobId, status, error };
}

function parseVolcengineSeedreamDataItem(
  raw: unknown,
  input: Text2ImageInput,
  providerJobId?: string,
): GeneratedItem | null {
  const item = typeof raw === "string" ? { url: raw } : asRecord(raw);
  const error = errorFrom(item);
  if (error) return null;
  const b64Json = stringParam(item.b64_json);
  if (b64Json) {
    return {
      bytes: Buffer.from(b64Json, "base64"),
      contentType: contentTypeFromFormat(
        item.output_format ?? input.params.output_format ?? "jpeg",
      ),
      persistence: "project-oss",
      requireOssPersistence: true,
      providerJobId,
    };
  }

  const resolved = resolveImageUrl(stringParam(item.url), input.baseUrl);
  const original = preferOriginalImageUrl(resolved);
  if (!original) return null;
  return {
    url: original,
    fallbackUrl:
      original && resolved && original !== resolved ? resolved : undefined,
    contentType: contentTypeFromFormat(
      item.output_format ?? input.params.output_format ?? "jpeg",
    ),
    persistence: "project-oss",
    requireOssPersistence: true,
    providerJobId,
  };
}

function parseVolcengineSeedreamResponse(
  payload: unknown,
  input: Text2ImageInput,
): Text2ImageAdapterResult {
  const record = asRecord(payload);
  const providerJobId = providerJobIdFrom(record);
  const rawItems = Array.isArray(record.data) ? record.data : [];
  const items = rawItems
    .map((raw) => parseVolcengineSeedreamDataItem(raw, input, providerJobId))
    .filter((item): item is GeneratedItem => Boolean(item));
  const failed = rawItems
    .map((raw) => errorFrom(asRecord(raw)))
    .filter((item): item is string => Boolean(item));
  return {
    items,
    providerJobId,
    status: statusFrom(record),
    error:
      errorFrom(record) ??
      (items.length ? undefined : failed[0]) ??
      (items.length ? undefined : rawItems.length ? "Image generation failed upstream" : undefined),
  };
}

function parseVolcengineSeedreamStreamPayloads(
  payloads: unknown[],
  input: Text2ImageInput,
): Text2ImageAdapterResult {
  const items: GeneratedItem[] = [];
  const errors: string[] = [];
  let completed: Record<string, unknown> | undefined;

  for (const payload of payloads) {
    const record = asRecord(payload);
    const type = stringParam(record.type);
    if (type === "image_generation.partial_succeeded") {
      const item = parseVolcengineSeedreamDataItem(record, input);
      if (item) items.push(item);
      continue;
    }
    if (type === "image_generation.partial_failed") {
      const error = errorFrom(record);
      if (error) errors.push(error);
      continue;
    }
    if (type === "image_generation.completed") {
      completed = record;
    }
  }

  return {
    items,
    status: completed ? "completed" : undefined,
    error:
      items.length
        ? undefined
        : errors[0] ??
          errorFrom(completed ?? {}) ??
          (payloads.length ? "Image generation failed upstream" : undefined),
  };
}

function parseDpiChatCompletionsResponse(
  payload: unknown,
  input: Text2ImageInput,
): Text2ImageAdapterResult {
  const record = asRecord(payload);
  const providerJobId = providerJobIdFrom(record);
  const status = statusFrom(record);
  const error = errorFrom(record);
  const directUrls = [stringParam(record.url)].filter(
    (item): item is string => Boolean(item),
  );
  const contentUrls = extractChatCompletionContent(record).flatMap(
    extractMarkdownImageUrls,
  );
  const urls = [...new Set([...directUrls, ...contentUrls])];

  const items = urls
    .map((rawUrl): GeneratedItem | null => {
      const inline = dataUrlItem(rawUrl);
      if (inline) {
        return {
          ...inline,
          requireOssPersistence: true,
          providerJobId,
        };
      }

      const resolved = resolveImageUrl(rawUrl, input.baseUrl);
      const original = preferOriginalImageUrl(resolved);
      if (!original) return null;
      return {
        url: original,
        fallbackUrl:
          original && resolved && original !== resolved ? resolved : undefined,
        contentType: contentTypeFromFormat(input.params.output_format),
        persistence: "project-oss",
        requireOssPersistence: true,
        providerJobId,
      };
    })
    .filter((item): item is GeneratedItem => Boolean(item));

  return { items, providerJobId, status, error };
}

function extractImageUrls(payload: unknown) {
  const record = asRecord(payload);
  const urls = new Set<string>();
  const collect = (value: unknown) => {
    if (!value) return;
    if (typeof value === "string") {
      if (/^(data:image\/|https?:\/\/)/i.test(value)) urls.add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (typeof value !== "object") return;
    const nested = value as Record<string, unknown>;
    for (const key of [
      "url",
      "image",
      "images",
      "image_url",
      "imageUrl",
      "sample",
      "result",
      "results",
      "output",
      "outputs",
      "result_url",
      "resultUrl",
      "signed_url",
      "signedUrl",
      "data",
    ]) {
      collect(nested[key]);
    }
  };
  collect(record);
  return [...urls];
}

function parseImageUrlResponse(
  payload: unknown,
  input: Text2ImageInput,
): Text2ImageAdapterResult {
  const record = asRecord(payload);
  const providerJobId = providerJobIdFrom(record);
  const statusUrl = stringParam(record.polling_url ?? record.pollingUrl);
  const status = statusFrom(record);
  const error = errorFrom(record);
  const items = extractImageUrls(payload)
    .map((rawUrl): GeneratedItem | null => {
      const inline = dataUrlItem(rawUrl);
      if (inline) {
        return {
          ...inline,
          requireOssPersistence: true,
          providerJobId,
        };
      }
      const resolved = resolveImageUrl(rawUrl, input.baseUrl);
      const original = preferOriginalImageUrl(resolved);
      if (!original) return null;
      return {
        url: original,
        fallbackUrl:
          original && resolved && original !== resolved ? resolved : undefined,
        contentType: contentTypeFromFormat(input.params.output_format),
        persistence: "project-oss",
        requireOssPersistence: true,
        providerJobId,
      };
    })
    .filter((item): item is GeneratedItem => Boolean(item));
  return { items, providerJobId, statusUrl, status, error };
}

export function parseDirectText2ImageOrigins(raw: string | undefined | null) {
  return (raw ?? "")
    .split(",")
    .map((item) => normalizeOrigin(item))
    .filter((item): item is string => Boolean(item));
}

export function isDirectText2ImageProviderBaseUrl(
  baseUrl: string,
  directProviderOrigins: string[],
) {
  const origin = originForUrl(baseUrl);
  return Boolean(origin && directProviderOrigins.includes(origin));
}

const dpiChatCompletionsAdapter: Text2ImageAdapter = {
  name: "dpi-chat-completions",
  matches: (input) => isDpiChatCompletionsProvider(input),
  resolveUrl: (input) => resolveChatCompletionsUrl(input.baseUrl),
  buildPayload: buildDpiChatCompletionsPayload,
  parseResponse: parseDpiChatCompletionsResponse,
};

function bflImagePayloadDebug(payload: Record<string, unknown>) {
  const image = stringParam(payload.image);
  const mask = stringParam(payload.mask);
  return {
    model: stringParam(payload.model),
    promptLength: stringParam(payload.prompt)?.length ?? 0,
    response_format: stringParam(payload.response_format),
    output_format: stringParam(payload.output_format),
    imageBytes: image ? Buffer.byteLength(image, "base64") : 0,
    maskBytes: mask ? Buffer.byteLength(mask, "base64") : 0,
  };
}

const bflImageEditAdapter: Text2ImageAdapter = {
  name: "bfl-image-edit",
  matches: (input) => isBflImageEditProvider(input),
  resolveUrl: resolveBflImageEditCreateUrl,
  buildPayload: buildBflImageEditPayload,
  requestHeaders: (input) =>
    isDirectBflProvider(input)
      ? {
          ...bflAuthHeaders(input),
          "Content-Type": "application/json",
        }
      : bearerJsonHeaders(input),
  pollHeaders: (input) =>
    isDirectBflProvider(input)
      ? bflAuthHeaders(input)
      : bearerPollHeaders(input),
  debugPayload: bflImagePayloadDebug,
  parseResponse: parseImageUrlResponse,
};

const flux2EditAdapter: Text2ImageAdapter = {
  name: "flux2-edit",
  matches: (input) => isFlux2EditProvider(input),
  resolveUrl: resolveFlux2EditCreateUrl,
  buildPayload: buildFlux2EditPayload,
  parseResponse: parseImageUrlResponse,
};

const directHostedImageAdapter: Text2ImageAdapter = {
  name: "direct-hosted-image",
  matches: (input, config) =>
    isDirectText2ImageProviderBaseUrl(
      input.baseUrl,
      config.directProviderOrigins,
    ),
  resolveUrl: (input) => resolveText2ImageUrl(input.baseUrl),
  buildPayload: buildOpenAiCompatiblePayload,
  parseResponse: (payload, input) =>
    parseOpenAiCompatibleResponse(payload, input, "project-oss"),
};

function volcengineSeedreamPayloadDebug(payload: Record<string, unknown>) {
  const image = payload.image;
  const references = Array.isArray(image)
    ? stringArray(image)
    : typeof image === "string"
      ? [image]
      : [];
  return {
    model: stringParam(payload.model),
    promptLength: stringParam(payload.prompt)?.length ?? 0,
    size: payload.size,
    response_format: stringParam(payload.response_format),
    output_format: stringParam(payload.output_format),
    stream: payload.stream,
    sequential_image_generation: payload.sequential_image_generation,
    max_images: asRecord(payload.sequential_image_generation_options).max_images,
    referenceImageCount: references.length,
    referenceImages: references.map((url) => ({
      kind: /^data:/i.test(url) ? "data-url" : "url",
      length: url.length,
    })),
  };
}

const volcengineSeedreamAdapter: Text2ImageAdapter = {
  name: "volcengine-seedream",
  matches: (input) => isVolcengineSeedreamProvider(input),
  resolveUrl: (input) => resolveVolcengineSeedreamUrl(input.baseUrl),
  buildPayload: buildVolcengineSeedreamPayload,
  debugPayload: volcengineSeedreamPayloadDebug,
  parseResponse: parseVolcengineSeedreamResponse,
  parseStreamPayloads: parseVolcengineSeedreamStreamPayloads,
};

function text2ImagePayloadDebug(payload: Record<string, unknown>) {
  const references = [
    ...stringArray(payload.reference_images),
    ...stringArray(payload.image_urls),
    ...stringArray(payload.images),
    ...(typeof payload.image === "string" ? [payload.image] : []),
    ...(typeof payload.input_reference === "string" ? [payload.input_reference] : []),
  ].filter((item, index, items) => item.trim() && items.indexOf(item) === index);
  return {
    model: stringParam(payload.model),
    promptLength: stringParam(payload.prompt)?.length ?? 0,
    n: payload.n,
    size: payload.size,
    async: payload.async,
    wait_for_result: payload.wait_for_result,
    referenceImageCount: references.length,
    referenceImages: references.map((url) => ({
      kind: /^data:/i.test(url) ? "data-url" : "url",
      length: url.length,
    })),
  };
}

const magickApiText2ImageAdapter: Text2ImageAdapter = {
  name: "magickapi-text2image",
  matches: (input) => isMagickApiText2ImageProvider(input),
  resolveUrl: (input) => resolveText2ImageUrl(input.baseUrl),
  buildPayload: buildMagickApiText2ImagePayload,
  debugPayload: text2ImagePayloadDebug,
  parseResponse: (payload, input) =>
    parseOpenAiCompatibleResponse(payload, input, "project-oss"),
};

const crexText2ImageAdapter: Text2ImageAdapter = {
  name: "crex-text2image",
  matches: (input) => isCrexText2ImageProvider(input),
  resolveUrl: (input) => resolveText2ImageUrl(input.baseUrl),
  buildPayload: buildCrexText2ImagePayload,
  debugPayload: text2ImagePayloadDebug,
  parseResponse: (payload, input) =>
    parseOpenAiCompatibleResponse(payload, input, "project-oss"),
};

const openAiCompatibleAdapter: Text2ImageAdapter = {
  name: "openai-compatible-project-oss",
  matches: () => true,
  resolveUrl: (input) => resolveText2ImageUrl(input.baseUrl),
  buildPayload: buildOpenAiCompatiblePayload,
  parseResponse: (payload, input) =>
    parseOpenAiCompatibleResponse(payload, input, "project-oss"),
};

const text2ImageAdapters = [
  bflImageEditAdapter,
  flux2EditAdapter,
  volcengineSeedreamAdapter,
  magickApiText2ImageAdapter,
  crexText2ImageAdapter,
  dpiChatCompletionsAdapter,
  directHostedImageAdapter,
  openAiCompatibleAdapter,
];

export function selectText2ImageAdapter(
  input: Text2ImageInput,
  config: Text2ImageAdapterConfig,
) {
  return (
    text2ImageAdapters.find((adapter) => adapter.matches(input, config)) ??
    openAiCompatibleAdapter
  );
}
