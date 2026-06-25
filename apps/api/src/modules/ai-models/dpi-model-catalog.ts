import type { AIModelAccessLevel, AIModelCategory } from "@prisma/client";

export interface BuiltInAiModelDefinition {
  code: string;
  displayName: string;
  category: AIModelCategory;
  baseUrl: string;
  apiKey: string;
  modelName: string;
  defaultParams: Record<string, unknown>;
  costCredits: number;
  sortOrder: number;
  accessLevel?: AIModelAccessLevel;
  description?: string;
}

const DPI_DEFAULT_BASE_URL = "https://dpi.crex.cn/v1";

const dpiImageModelNames = [
  "gemini-2.5-flash-image-landscape",
  "gemini-2.5-flash-image-portrait",
  "gemini-3.0-pro-image-landscape",
  "gemini-3.0-pro-image-portrait",
  "gemini-3.0-pro-image-square",
  "gemini-3.0-pro-image-four-three",
  "gemini-3.0-pro-image-three-four",
  "gemini-3.0-pro-image-landscape-2k",
  "gemini-3.0-pro-image-portrait-2k",
  "gemini-3.0-pro-image-square-2k",
  "gemini-3.0-pro-image-four-three-2k",
  "gemini-3.0-pro-image-three-four-2k",
  "gemini-3.0-pro-image-landscape-4k",
  "gemini-3.0-pro-image-portrait-4k",
  "gemini-3.0-pro-image-square-4k",
  "gemini-3.0-pro-image-four-three-4k",
  "gemini-3.0-pro-image-three-four-4k",
  "imagen-4.0-generate-preview-landscape",
  "imagen-4.0-generate-preview-portrait",
  "gemini-3.1-flash-image-landscape",
  "gemini-3.1-flash-image-portrait",
  "gemini-3.1-flash-image-square",
  "gemini-3.1-flash-image-four-three",
  "gemini-3.1-flash-image-three-four",
  "gemini-3.1-flash-image-landscape-2k",
  "gemini-3.1-flash-image-portrait-2k",
  "gemini-3.1-flash-image-square-2k",
  "gemini-3.1-flash-image-four-three-2k",
  "gemini-3.1-flash-image-three-four-2k",
  "gemini-3.1-flash-image-landscape-4k",
  "gemini-3.1-flash-image-portrait-4k",
  "gemini-3.1-flash-image-square-4k",
  "gemini-3.1-flash-image-four-three-4k",
  "gemini-3.1-flash-image-three-four-4k",
];

const dpiVideoModelNames = [
  "veo_3_1_t2v_fast_portrait",
  "veo_3_1_t2v_fast_landscape",
  "veo_3_1_t2v_fast_portrait_ultra",
  "veo_3_1_t2v_fast_ultra",
  "veo_3_1_t2v_fast_portrait_ultra_relaxed",
  "veo_3_1_t2v_fast_ultra_relaxed",
  "veo_3_1_t2v_portrait",
  "veo_3_1_t2v_landscape",
  "veo_3_1_t2v_lite_portrait",
  "veo_3_1_t2v_lite_landscape",
  "veo_3_1_i2v_s_fast_portrait_fl",
  "veo_3_1_i2v_s_fast_fl",
  "veo_3_1_i2v_s_fast_portrait_ultra_fl",
  "veo_3_1_i2v_s_fast_ultra_fl",
  "veo_3_1_i2v_s_fast_portrait_ultra_relaxed",
  "veo_3_1_i2v_s_fast_ultra_relaxed",
  "veo_3_1_i2v_s_portrait",
  "veo_3_1_i2v_s_landscape",
  "veo_3_1_i2v_lite_portrait",
  "veo_3_1_i2v_lite_landscape",
  "veo_3_1_interpolation_lite_portrait",
  "veo_3_1_interpolation_lite_landscape",
  "veo_3_1_r2v_fast_portrait",
  "veo_3_1_r2v_fast",
  "veo_3_1_r2v_fast_portrait_ultra",
  "veo_3_1_r2v_fast_ultra",
  "veo_3_1_r2v_fast_portrait_ultra_relaxed",
  "veo_3_1_r2v_fast_ultra_relaxed",
  "veo_3_1_t2v_fast_portrait_4k",
  "veo_3_1_t2v_fast_4k",
  "veo_3_1_t2v_fast_portrait_ultra_4k",
  "veo_3_1_t2v_fast_ultra_4k",
  "veo_3_1_t2v_fast_portrait_1080p",
  "veo_3_1_t2v_fast_1080p",
  "veo_3_1_t2v_fast_portrait_ultra_1080p",
  "veo_3_1_t2v_fast_ultra_1080p",
  "veo_3_1_i2v_s_fast_portrait_ultra_fl_4k",
  "veo_3_1_i2v_s_fast_ultra_fl_4k",
  "veo_3_1_i2v_s_fast_portrait_ultra_fl_1080p",
  "veo_3_1_i2v_s_fast_ultra_fl_1080p",
  "veo_3_1_r2v_fast_portrait_ultra_4k",
  "veo_3_1_r2v_fast_ultra_4k",
  "veo_3_1_r2v_fast_portrait_ultra_1080p",
  "veo_3_1_r2v_fast_ultra_1080p",
];

function firstEnv(env: NodeJS.ProcessEnv, keys: string[]) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return "";
}

function text2imageApiKey(env: NodeJS.ProcessEnv) {
  return firstEnv(env, ["DPI_TEXT2IMAGE_API_KEY", "DPI_API_KEY"]);
}

function image2videoApiKey(env: NodeJS.ProcessEnv) {
  return firstEnv(env, [
    "DPI_IMAGE2VIDEO_API_KEY",
    "DPI_VIDEO_API_KEY",
    "DPI_API_KEY",
    "DPI_TEXT2IMAGE_API_KEY",
  ]);
}

function text2imageBaseUrl(env: NodeJS.ProcessEnv) {
  return (
    firstEnv(env, ["DPI_TEXT2IMAGE_BASE_URL", "DPI_BASE_URL"]) ||
    DPI_DEFAULT_BASE_URL
  );
}

function image2videoBaseUrl(env: NodeJS.ProcessEnv) {
  return (
    firstEnv(env, [
      "DPI_IMAGE2VIDEO_BASE_URL",
      "DPI_VIDEO_BASE_URL",
      "DPI_TEXT2IMAGE_BASE_URL",
      "DPI_BASE_URL",
    ]) || DPI_DEFAULT_BASE_URL
  );
}

function imageCostCredits(modelName: string) {
  if (modelName.endsWith("-4k")) return 4;
  if (modelName.endsWith("-2k")) return 2;
  return 1;
}

function videoCostCredits(modelName: string) {
  if (
    modelName.includes("_ultra") ||
    modelName.endsWith("_4k") ||
    modelName.endsWith("_1080p")
  ) {
    return 35;
  }
  if (modelName.includes("_fast") || modelName.includes("_lite")) return 24;
  return 28;
}

function modelAccessLevel(modelName: string): AIModelAccessLevel {
  return modelName.includes("-2k") ||
    modelName.includes("_1080p") ||
    modelName.includes("-4k") ||
    modelName.includes("_4k")
    ? "PAID"
    : "FREE";
}

function providerDisplayName(modelName: string) {
  return `DPI ${modelName}`;
}

function modelDescription(category: AIModelCategory, modelName: string) {
  if (category === "TEXT2IMAGE") {
    return `Built-in DPI image model imported from flow2api README: ${modelName}`;
  }
  return `Built-in DPI video model imported from flow2api README: ${modelName}`;
}

function buildText2ImageDefaults() {
  return {
    apiStyle: "dpi-chat-completions",
    n: 1,
    async: true,
    pollAttempts: 360,
    pollIntervalMs: 5000,
    requestTimeoutMs: 15 * 60_000,
  };
}

function buildImage2VideoDefaults() {
  return {
    apiStyle: "dpi-chat-completions",
    duration: 5,
  };
}

export function getBuiltInDpiModels(
  env: NodeJS.ProcessEnv = process.env,
): BuiltInAiModelDefinition[] {
  const imageBaseUrl = text2imageBaseUrl(env);
  const imageApiKey = text2imageApiKey(env);
  const videoBaseUrl = image2videoBaseUrl(env);
  const videoApiKey = image2videoApiKey(env);

  const imageModels = dpiImageModelNames.map((modelName, index) => ({
    code: `dpi-${modelName}`,
    displayName: providerDisplayName(modelName),
    category: "TEXT2IMAGE" as const,
    baseUrl: imageBaseUrl,
    apiKey: imageApiKey,
    modelName,
    defaultParams: buildText2ImageDefaults(),
    costCredits: imageCostCredits(modelName),
    sortOrder: 100 + index,
    accessLevel: modelAccessLevel(modelName),
    description: modelDescription("TEXT2IMAGE", modelName),
  }));

  const videoModels = dpiVideoModelNames.map((modelName, index) => ({
    code: `dpi-${modelName}`,
    displayName: providerDisplayName(modelName),
    category: "IMAGE2VIDEO" as const,
    baseUrl: videoBaseUrl,
    apiKey: videoApiKey,
    modelName,
    defaultParams: buildImage2VideoDefaults(),
    costCredits: videoCostCredits(modelName),
    sortOrder: 100 + index,
    accessLevel: modelAccessLevel(modelName),
    description: modelDescription("IMAGE2VIDEO", modelName),
  }));

  return [...imageModels, ...videoModels];
}
