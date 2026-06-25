import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaService } from "nestjs-prisma";
import { CryptoService } from "@/common/services/crypto.service";
import { SiteSettingsService } from "../site-settings/site-settings.service";
import {
  ModelProvidersService,
  type ModelProviderApiStyle,
} from "../model-providers/model-providers.service";
import { Prisma } from "@prisma/client";
import type {
  AIModel,
  AIModelAccessLevel,
  AIModelCategory,
} from "@prisma/client";
import { getBuiltInDpiModels } from "./dpi-model-catalog";

type VideoInputMode = "T2V" | "I2V" | "R2V" | "EDIT";
type ImageInputMode = "T2I" | "I2I" | "EDIT";

const DEFAULT_TEXT_MODEL_USAGES = ["生图提示词草稿", "生视频分镜制作"] as const;
const TEXT_USAGES_PARAM_KEY = "textUsages";
const SYSTEM_PROMPT_PARAM_KEY = "systemPrompt";
const SEEDREAM_MAX_REFERENCE_IMAGES = 14;

type VideoModelRequirements = {
  videoInputMode: VideoInputMode | null;
  supportsReferenceImages: boolean;
  requiresReferenceImages: boolean;
  minReferenceImages: number;
  maxReferenceImages: number;
};

type ImageModelRequirements = {
  imageInputMode: ImageInputMode | null;
  supportsReferenceImages: boolean;
  requiresReferenceImages: boolean;
  minReferenceImages: number;
  maxReferenceImages: number;
};

interface UpsertInput {
  id?: string;
  code: string;
  displayName: string;
  displayNameEn?: string | null;
  category: AIModelCategory;
  textUsages?: string[];
  systemPrompt?: string;
  videoInputMode?: VideoInputMode;
  providerId?: string | null;
  baseUrl: string;
  modelName: string;
  costCredits: number;
  accessLevel?: AIModelAccessLevel;
  defaultParams?: Record<string, unknown>;
  rateLimitPerMinute?: number;
  isActive?: boolean;
  isDefault?: boolean;
  supportsReferenceImages?: boolean;
  requiresReferenceImages?: boolean;
  sortOrder?: number;
  description?: string;
  apiKey?: string;
}

function normalizeProviderApiKey(value: string) {
  return value.trim().replace(/^Bearer\s+/i, "").trim();
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function intParam(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function inferText2ImageApiStyle(
  baseUrl: string,
  params: Record<string, unknown>,
): ModelProviderApiStyle {
  const configured = stringParam(params.apiStyle ?? params.provider);
  if (configured?.toUpperCase() === "VOLCENGINE") return "VOLCENGINE";
  if (configured?.toUpperCase() === "CREX") return "CREX";
  if (configured?.toUpperCase() === "OPENAI") return "OPENAI";
  const lower = baseUrl.toLowerCase();
  if (
    lower.includes("volces.com") ||
    lower.includes("volcengine.com") ||
    lower.includes("ark.cn-beijing")
  ) {
    return "VOLCENGINE";
  }
  if (
    lower.includes("crex.cn") ||
    lower.includes("bpi.") ||
    lower.includes("gpt2api") ||
    lower.includes("chatgpt2api")
  ) {
    return "CREX";
  }
  return "OPENAI";
}

function defaultText2ImageParams() {
  return {
    size: "1024x1024",
    n: 1,
  };
}

@Injectable()
export class AiModelsService implements OnModuleInit {
  private readonly logger = new Logger(AiModelsService.name);
  private builtInModelsSynced = false;
  private builtInModelsSyncPromise: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly settings: SiteSettingsService,
    private readonly providers: ModelProvidersService,
  ) {}

  onModuleInit() {
    void this.ensureBuiltInModels();
  }

  async listPublic(category?: AIModelCategory) {
    await this.ensureBuiltInModels();
    const videoGenerationEnabled = await this.settings.isVideoGenerationEnabled();
    if (category === "IMAGE2VIDEO" && !videoGenerationEnabled) return [];
    const models = await this.prisma.aIModel.findMany({
      where: {
        isActive: true,
        ...(category ? { category } : {}),
        ...(!category && !videoGenerationEnabled ? { category: { not: "IMAGE2VIDEO" } } : {}),
      },
      orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
      select: {
        id: true,
        code: true,
        displayName: true,
        displayNameEn: true,
        category: true,
        accessLevel: true,
        costCredits: true,
        isDefault: true,
        isActive: true,
        modelName: true,
        defaultParams: true,
        description: true,
        providerId: true,
        supportsReferenceImages: true,
        requiresReferenceImages: true,
        provider: {
          select: {
            id: true,
            code: true,
                name: true,
                baseUrl: true,
                apiStyle: true,
                statusUrl: true,
                maxPollDurationMs: true,
                pollIntervalMs: true,
                maxPollAttempts: true,
                isActive: true,
              },
            },
      },
    });
    return models.map(({ defaultParams: _defaultParams, ...model }) => ({
      ...model,
      textUsages: this.textUsagesFromParams(_defaultParams, model.category),
      systemPrompt: this.systemPromptFromParams(_defaultParams, model.category),
      ...this.modelReferenceRequirements({ ...model, defaultParams: _defaultParams }),
    }));
  }

  listAdmin() {
    return this.ensureBuiltInModels().then(() =>
      this.prisma.aIModel
        .findMany({
          orderBy: [{ category: "asc" }, { isDefault: "desc" }, { sortOrder: "asc" }],
          include: {
            provider: {
              select: {
                id: true,
                code: true,
                name: true,
                baseUrl: true,
                apiStyle: true,
                statusUrl: true,
                maxPollDurationMs: true,
                pollIntervalMs: true,
                maxPollAttempts: true,
                apiKeyEnc: true,
                isActive: true,
              },
            },
          },
        })
        .then((models) => models.map((model) => this.toAdminModel(model))),
    );
  }

  async byCode(code: string) {
    await this.ensureBuiltInModels();
    const model = await this.prisma.aIModel.findUnique({ where: { code } });
    if (!model) {
      const fallback = await this.ensureText2ImageFallback(code);
      if (fallback) return fallback;
      throw new NotFoundException();
    }
    return model;
  }

  private async ensureText2ImageFallback(code: string) {
    if (!["gpt-image-2", "gpt-image-1", "default-text2image"].includes(code)) {
      return null;
    }

    const apiKey =
      process.env.DEFAULT_AI_TEXT2IMAGE_API_KEY ??
      process.env.CHAT_GPT_KEY ??
      process.env.VITE_CHAT_GPT_KEY ??
      "";
    const baseUrl =
      process.env.DEFAULT_AI_TEXT2IMAGE_BASE_URL ??
      process.env.BPI_TEXT2IMAGE_BASE_URL ??
      "";

    return this.prisma.aIModel.upsert({
      where: { code },
      update: {
        displayName: code === "gpt-image-1" ? "Megick Image v1" : "Megick Image v2",
        displayNameEn: code === "gpt-image-1" ? "Megick Image v1" : "Megick Image v2",
        category: "TEXT2IMAGE",
        baseUrl,
        modelName: code,
        costCredits: 1,
        accessLevel: "FREE",
        defaultParams: defaultText2ImageParams() as Prisma.InputJsonValue,
        rateLimitPerMinute: 60,
        isActive: true,
        isDefault: false,
        supportsReferenceImages: code === "gpt-image-2",
        requiresReferenceImages: false,
      },
      create: {
        code,
        displayName: code === "gpt-image-1" ? "Megick Image v1" : "Megick Image v2",
        displayNameEn: code === "gpt-image-1" ? "Megick Image v1" : "Megick Image v2",
        category: "TEXT2IMAGE",
        baseUrl,
        apiKeyEnc: this.crypto.encrypt(apiKey),
        modelName: code,
        costCredits: 1,
        accessLevel: "FREE",
        defaultParams: defaultText2ImageParams() as Prisma.InputJsonValue,
        rateLimitPerMinute: 60,
        isActive: true,
        isDefault: false,
        supportsReferenceImages: code === "gpt-image-2",
        requiresReferenceImages: false,
        sortOrder: code === "gpt-image-2" ? 0 : 1,
      },
    });
  }

  async getDecryptedKey(code: string): Promise<{
    apiKey: string;
    baseUrl: string;
    providerId: string | null;
    apiStyle: ModelProviderApiStyle;
    statusUrl: string | null;
    maxPollDurationMs: number;
    pollIntervalMs: number;
    maxPollAttempts: number;
    modelName: string;
    defaultParams: Record<string, unknown>;
    costCredits: number;
  }> {
    const m = await this.byCode(code);
    const modelDefaultParams = this.asRecord(m.defaultParams);
    if (m.providerId) {
      const provider = await this.providers.resolve(m.providerId);
      return {
        apiKey: provider?.apiKey ?? "",
        baseUrl: provider?.baseUrl ?? "",
        providerId: provider?.id ?? m.providerId,
        apiStyle: provider?.apiStyle ?? inferText2ImageApiStyle(provider?.baseUrl ?? "", modelDefaultParams),
        statusUrl: provider?.statusUrl ?? null,
        maxPollDurationMs: provider?.maxPollDurationMs ?? 15 * 60_000,
        pollIntervalMs: provider?.pollIntervalMs ?? 5000,
        maxPollAttempts: provider?.maxPollAttempts ?? 180,
        modelName: m.modelName,
        defaultParams: {
          ...(provider?.extra ?? {}),
          ...modelDefaultParams,
        },
        costCredits: m.costCredits,
      };
    }

    const modelApiKey = normalizeProviderApiKey(this.decryptStoredKey(m.apiKeyEnc));
    return {
      apiKey: modelApiKey,
      baseUrl: m.baseUrl.trim(),
      providerId: null,
      apiStyle: inferText2ImageApiStyle(m.baseUrl.trim(), modelDefaultParams),
      statusUrl: stringParam(modelDefaultParams.statusUrl ?? modelDefaultParams.pollUrl) ?? null,
      maxPollDurationMs: 15 * 60_000,
      pollIntervalMs: 5000,
      maxPollAttempts: 180,
      modelName: m.modelName,
      defaultParams: modelDefaultParams,
      costCredits: m.costCredits,
    };
  }

  async upsert(input: UpsertInput) {
    const providerId = input.providerId || null;
    const apiKeyEnc =
      providerId
        ? this.crypto.encrypt("")
        : input.apiKey !== undefined
        ? this.crypto.encrypt(normalizeProviderApiKey(input.apiKey))
        : undefined;
    const defaultParams = this.normalizeDefaultParams(input);
    const referenceConfig = this.normalizeReferenceConfig(input);
    const model = await this.prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.aIModel.updateMany({
          where: {
            category: input.category,
            ...(input.id ? { id: { not: input.id } } : { code: { not: input.code } }),
          },
          data: { isDefault: false },
        });
      }

      const data = {
        displayName: input.displayName,
        displayNameEn: this.normalizeDisplayNameEn(input.displayNameEn, input.displayName),
        category: input.category,
        providerId,
        baseUrl: providerId ? "" : input.baseUrl.trim(),
        modelName: input.modelName,
        costCredits: input.costCredits,
        accessLevel: input.accessLevel ?? "FREE",
        defaultParams: defaultParams as Prisma.InputJsonValue,
        rateLimitPerMinute: input.rateLimitPerMinute ?? 60,
        isActive: input.isDefault ? true : (input.isActive ?? true),
        isDefault: input.isDefault ?? false,
        supportsReferenceImages: referenceConfig.supportsReferenceImages,
        requiresReferenceImages: referenceConfig.requiresReferenceImages,
        sortOrder: input.sortOrder ?? 0,
        description: input.description,
        ...(apiKeyEnc !== undefined ? { apiKeyEnc } : {}),
      };

      if (input.id) {
        return tx.aIModel.update({
          where: { id: input.id },
          data: {
            code: input.code,
            ...data,
          },
        });
      }

      return tx.aIModel.upsert({
        where: { code: input.code },
        update: data,
        create: {
          code: input.code,
          displayName: input.displayName,
          displayNameEn: this.normalizeDisplayNameEn(input.displayNameEn, input.displayName),
          category: input.category,
          providerId,
          baseUrl: providerId ? "" : input.baseUrl.trim(),
          modelName: input.modelName,
          costCredits: input.costCredits,
          accessLevel: input.accessLevel ?? "FREE",
          defaultParams: defaultParams as Prisma.InputJsonValue,
          rateLimitPerMinute: input.rateLimitPerMinute ?? 60,
          isActive: input.isDefault ? true : (input.isActive ?? true),
          isDefault: input.isDefault ?? false,
          supportsReferenceImages: referenceConfig.supportsReferenceImages,
          requiresReferenceImages: referenceConfig.requiresReferenceImages,
          sortOrder: input.sortOrder ?? 0,
          description: input.description,
          apiKeyEnc: apiKeyEnc ?? this.crypto.encrypt(""),
        },
      });
    });
    const saved = await this.prisma.aIModel.findUnique({
      where: { id: model.id },
      include: {
        provider: {
          select: {
            id: true,
            code: true,
            name: true,
            baseUrl: true,
            apiStyle: true,
            statusUrl: true,
            maxPollDurationMs: true,
            pollIntervalMs: true,
            maxPollAttempts: true,
            apiKeyEnc: true,
            isActive: true,
          },
        },
      },
    });
    return this.toAdminModel(saved ?? model);
  }

  async delete(code: string) {
    try {
      const model = await this.prisma.aIModel.delete({ where: { code } });
      return this.toAdminModel(model);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        throw new BadRequestException(
          "AI model is referenced by generation history and cannot be deleted. Disable it instead, or delete related generation jobs first.",
        );
      }
      throw error;
    }
  }

  private async ensureBuiltInModels() {
    if (this.builtInModelsSynced) return;
    if (!this.builtInModelsSyncPromise) {
      this.builtInModelsSyncPromise = this.syncBuiltInModels()
        .then(() => {
          this.builtInModelsSynced = true;
        })
        .catch((err) => {
          this.logger.error(
            `Failed to sync built-in DPI AI models: ${(err as Error).message}`,
          );
        })
        .finally(() => {
          this.builtInModelsSyncPromise = null;
        });
    }
    await this.builtInModelsSyncPromise;
  }

  private async syncBuiltInModels() {
    await this.providers.listPublic();
    const volcengineProvider = await this.prisma.modelProviderConfig.findUnique({
      where: { code: "volcengine" },
      select: { id: true, apiKeyEnc: true, isActive: true },
    });
    if (volcengineProvider) {
      await this.syncBuiltInVolcengineModels(volcengineProvider);
    }

    const builtInModels = getBuiltInDpiModels();
    for (const definition of builtInModels) {
      const existing = await this.prisma.aIModel.findUnique({
        where: { code: definition.code },
        select: {
          id: true,
          displayName: true,
          displayNameEn: true,
          costCredits: true,
          defaultParams: true,
          rateLimitPerMinute: true,
          isActive: true,
          isDefault: true,
          sortOrder: true,
          description: true,
        },
      });
      const apiKeyEnc =
        definition.apiKey.trim().length > 0
          ? this.crypto.encrypt(definition.apiKey)
          : undefined;
      const mergedDefaultParams = {
        ...((definition.defaultParams ?? {}) as Record<string, unknown>),
        ...(this.asRecord(existing?.defaultParams) ?? {}),
      };

      if (existing) {
        // Existing model: skip — admin panel is the source of truth.
        // Only create models that don't exist yet.
        continue;
      }

      await this.prisma.aIModel.create({
        data: {
          code: definition.code,
          displayName: definition.displayName,
          displayNameEn: definition.displayName,
          category: definition.category,
          baseUrl: definition.baseUrl,
          apiKeyEnc: apiKeyEnc ?? this.crypto.encrypt(""),
          modelName: definition.modelName,
          costCredits: definition.costCredits,
          accessLevel: definition.accessLevel ?? "FREE",
          defaultParams: mergedDefaultParams as Prisma.InputJsonValue,
          rateLimitPerMinute: 60,
          isActive: Boolean(definition.apiKey.trim()),
          isDefault: false,
          supportsReferenceImages: false,
          requiresReferenceImages: false,
          sortOrder: definition.sortOrder,
          description: definition.description,
        },
      });
    }
  }

  private async syncBuiltInVolcengineModels(provider: {
    id: string;
    apiKeyEnc: string;
    isActive: boolean;
  }) {
    const hasProviderKey = this.hasEncryptedKey(provider.apiKeyEnc);
    const seedanceBaseParams = {
      apiStyle: "volcengine-video",
      duration: 4,
      ratio: "adaptive",
      resolution: "720p",
      generate_audio: false,
      watermark: false,
      pollAttempts: 360,
      pollIntervalMs: 5000,
      maxPollDurationMs: 30 * 60_000,
    };
    const seedreamBaseParams = {
      apiStyle: "volcengine-seedream",
      imageInputMode: "I2I",
      size: "2048x2048",
      sequential_image_generation: "disabled",
      stream: false,
      response_format: "url",
      watermark: false,
      minReferenceImages: 0,
      maxReferenceImages: SEEDREAM_MAX_REFERENCE_IMAGES,
      requestTimeoutMs: 15 * 60_000,
    };
    const seedreamDefinitions = [
      {
        code: "volc-seedream-5-0-lite",
        displayName: "Seedream 5.0 Lite",
        modelName: "doubao-seedream-5-0-260128",
        defaultParams: {
          ...seedreamBaseParams,
          resolutionOptions: ["2K", "3K", "4K"],
          output_format: "jpeg",
        },
        costCredits: 8,
        sortOrder: 10,
        description:
          "Volcengine Doubao Seedream 5.0 Lite text/reference image generation.",
      },
      {
        code: "volc-seedream-4-5",
        displayName: "Seedream 4.5",
        modelName: "doubao-seedream-4-5-251128",
        defaultParams: {
          ...seedreamBaseParams,
          resolutionOptions: ["2K", "4K"],
        },
        costCredits: 6,
        sortOrder: 11,
        description:
          "Volcengine Doubao Seedream 4.5 text/reference image generation.",
      },
      {
        code: "volc-seedream-4-0",
        displayName: "Seedream 4.0",
        modelName: "doubao-seedream-4-0-250828",
        defaultParams: {
          ...seedreamBaseParams,
          resolutionOptions: ["1K", "2K", "4K"],
        },
        costCredits: 4,
        sortOrder: 12,
        description:
          "Volcengine Doubao Seedream 4.0 text/reference image generation.",
      },
    ];
    const seedanceDefinitions = [
      {
        code: "volc-seedance-2-0-t2v",
        displayName: "Seedance 2.0 Text to Video",
        modelName: "doubao-seedance-2-0-260128",
        videoInputMode: "T2V" as const,
        costCredits: 28,
        sortOrder: 20,
        description: "Volcengine Doubao Seedance 2.0 text-to-video.",
      },
      {
        code: "volc-seedance-2-0-i2v",
        displayName: "Seedance 2.0 Image to Video",
        modelName: "doubao-seedance-2-0-260128",
        videoInputMode: "I2V" as const,
        costCredits: 28,
        sortOrder: 21,
        description: "Volcengine Doubao Seedance 2.0 first-frame image-to-video.",
      },
      {
        code: "volc-seedance-2-0-r2v",
        displayName: "Seedance 2.0 Reference Video",
        modelName: "doubao-seedance-2-0-260128",
        videoInputMode: "R2V" as const,
        costCredits: 28,
        sortOrder: 22,
        description: "Volcengine Doubao Seedance 2.0 multi-reference video generation.",
      },
      {
        code: "volc-seedance-2-0-fast-t2v",
        displayName: "Seedance 2.0 Fast Text to Video",
        modelName: "doubao-seedance-2-0-fast-260128",
        videoInputMode: "T2V" as const,
        costCredits: 24,
        sortOrder: 23,
        description: "Volcengine Doubao Seedance 2.0 Fast text-to-video.",
      },
      {
        code: "volc-seedance-2-0-fast-i2v",
        displayName: "Seedance 2.0 Fast Image to Video",
        modelName: "doubao-seedance-2-0-fast-260128",
        videoInputMode: "I2V" as const,
        costCredits: 24,
        sortOrder: 24,
        description: "Volcengine Doubao Seedance 2.0 Fast first-frame image-to-video.",
      },
      {
        code: "volc-seedance-2-0-fast-r2v",
        displayName: "Seedance 2.0 Fast Reference Video",
        modelName: "doubao-seedance-2-0-fast-260128",
        videoInputMode: "R2V" as const,
        costCredits: 24,
        sortOrder: 25,
        description: "Volcengine Doubao Seedance 2.0 Fast multi-reference video generation.",
      },
      {
        code: "volc-seedance-1-5-pro-t2v",
        displayName: "Seedance 1.5 Pro Text to Video",
        modelName: "doubao-seedance-1-5-pro-251215",
        videoInputMode: "T2V" as const,
        costCredits: 28,
        sortOrder: 26,
        description: "Volcengine Doubao Seedance 1.5 Pro text-to-video.",
      },
      {
        code: "volc-seedance-1-5-pro-i2v",
        displayName: "Seedance 1.5 Pro Image to Video",
        modelName: "doubao-seedance-1-5-pro-251215",
        videoInputMode: "I2V" as const,
        costCredits: 28,
        sortOrder: 27,
        description: "Volcengine Doubao Seedance 1.5 Pro first-frame image-to-video.",
      },
      {
        code: "volc-seedance-1-5-pro-r2v",
        displayName: "Seedance 1.5 Pro First/Last Frame Video",
        modelName: "doubao-seedance-1-5-pro-251215",
        videoInputMode: "R2V" as const,
        costCredits: 28,
        sortOrder: 28,
        description: "Volcengine Doubao Seedance 1.5 Pro first/last-frame image-to-video.",
      },
    ];

    for (const definition of seedreamDefinitions) {
      const existing = await this.prisma.aIModel.findUnique({
        where: { code: definition.code },
        select: {
          id: true,
          defaultParams: true,
          isActive: true,
          description: true,
          supportsReferenceImages: true,
          providerId: true,
          baseUrl: true,
          modelName: true,
        },
      });
      const mergedDefaultParams = {
        ...definition.defaultParams,
        ...this.asRecord(existing?.defaultParams),
        apiStyle: "volcengine-seedream",
        imageInputMode: "I2I",
        stream: false,
        maxReferenceImages: SEEDREAM_MAX_REFERENCE_IMAGES,
        requestTimeoutMs:
          this.asRecord(existing?.defaultParams).requestTimeoutMs ??
          (definition.defaultParams as Record<string, unknown>).requestTimeoutMs,
      };
      const data = {
        displayName: definition.displayName,
        displayNameEn: definition.displayName,
        category: "TEXT2IMAGE" as const,
        providerId: provider.id,
        baseUrl: "",
        modelName: definition.modelName,
        defaultParams: mergedDefaultParams as Prisma.InputJsonValue,
        costCredits: definition.costCredits,
        accessLevel: "PAID" as const,
        rateLimitPerMinute: 60,
        supportsReferenceImages: true,
        requiresReferenceImages: false,
        sortOrder: definition.sortOrder,
        description: existing?.description || definition.description,
      };
      if (existing) {
        const existingParams = this.asRecord(existing.defaultParams);
        const requiredParamPatch = Object.entries({
          apiStyle: "volcengine-seedream",
          imageInputMode: "I2I",
          stream: false,
          maxReferenceImages: SEEDREAM_MAX_REFERENCE_IMAGES,
        }).some(([key, value]) => existingParams[key] !== value);
        const shouldPatch =
          existing.providerId !== provider.id ||
          existing.baseUrl !== "" ||
          existing.modelName !== definition.modelName ||
          !existing.supportsReferenceImages ||
          requiredParamPatch;
        if (shouldPatch) {
          await this.prisma.aIModel.update({
            where: { code: definition.code },
            data: {
              providerId: provider.id,
              baseUrl: "",
              modelName: definition.modelName,
              defaultParams: mergedDefaultParams as Prisma.InputJsonValue,
              supportsReferenceImages: true,
              requiresReferenceImages: false,
            },
          });
        }
        continue;
      }

      await this.prisma.aIModel.create({
        data: {
          code: definition.code,
          ...data,
          isActive: provider.isActive && hasProviderKey,
          isDefault: false,
          apiKeyEnc: this.crypto.encrypt(""),
        },
      });
    }

    for (const definition of seedanceDefinitions) {
      const existing = await this.prisma.aIModel.findUnique({
        where: { code: definition.code },
        select: { id: true, defaultParams: true, isActive: true, description: true },
      });
      const defaultParams = {
        ...seedanceBaseParams,
        videoInputMode: definition.videoInputMode,
      };
      const mergedDefaultParams = {
        ...defaultParams,
        ...this.asRecord(existing?.defaultParams),
        apiStyle: "volcengine-video",
        videoInputMode: definition.videoInputMode,
      };
      const data = {
        displayName: definition.displayName,
        displayNameEn: definition.displayName,
        category: "IMAGE2VIDEO" as const,
        providerId: provider.id,
        baseUrl: "",
        modelName: definition.modelName,
        defaultParams: mergedDefaultParams as Prisma.InputJsonValue,
        costCredits: definition.costCredits,
        accessLevel: "PAID" as const,
        rateLimitPerMinute: 60,
        supportsReferenceImages: false,
        requiresReferenceImages: false,
        sortOrder: definition.sortOrder,
        description: existing?.description || definition.description,
      };
      if (existing) {
        // Existing model: skip — admin panel is the source of truth for configuration.
        // Only create models that don't exist yet.
        continue;
      }

      await this.prisma.aIModel.create({
        data: {
          code: definition.code,
          ...data,
          isActive: provider.isActive && hasProviderKey,
          isDefault: false,
          apiKeyEnc: this.crypto.encrypt(""),
        },
      });
    }
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private normalizeDisplayNameEn(value: string | null | undefined, fallback: string) {
    const normalized = typeof value === "string" ? value.trim() : "";
    return normalized || fallback.trim();
  }

  private explicitVideoInputMode(value: unknown): VideoInputMode | null {
    return value === "T2V" || value === "I2V" || value === "R2V" || value === "EDIT" ? value : null;
  }

  private explicitImageInputMode(value: unknown): ImageInputMode | null {
    return value === "T2I" || value === "I2I" || value === "EDIT" ? value : null;
  }

  private withVideoInputMode(
    category: AIModelCategory,
    defaultParams: Record<string, unknown>,
    videoInputMode?: VideoInputMode,
  ) {
    if (category !== "IMAGE2VIDEO") {
      const { videoInputMode: _videoInputMode, ...rest } = defaultParams;
      return rest;
    }
    return videoInputMode ? { ...defaultParams, videoInputMode } : defaultParams;
  }

  private normalizeDefaultParams(input: Pick<UpsertInput, "category" | "defaultParams" | "textUsages" | "systemPrompt" | "videoInputMode">) {
    const params = this.withTextSystemPrompt(
      input.category,
      this.withTextUsages(
        input.category,
        input.defaultParams ?? {},
        input.textUsages,
      ),
      input.systemPrompt,
    );
    return this.withVideoInputMode(input.category, params, input.videoInputMode);
  }

  private normalizeReferenceConfig(
    input: Pick<UpsertInput, "category" | "supportsReferenceImages" | "requiresReferenceImages">,
  ) {
    if (input.category !== "TEXT2IMAGE") {
      return {
        supportsReferenceImages: false,
        requiresReferenceImages: false,
      };
    }
    const supportsReferenceImages = Boolean(
      input.supportsReferenceImages || input.requiresReferenceImages,
    );
    return {
      supportsReferenceImages,
      requiresReferenceImages: supportsReferenceImages && Boolean(input.requiresReferenceImages),
    };
  }

  private withTextUsages(
    category: AIModelCategory,
    defaultParams: Record<string, unknown>,
    textUsages?: string[],
  ) {
    const normalizedUsages = this.normalizeTextUsages(
      textUsages ?? this.textUsagesFromParams(defaultParams, category),
    );
    if (category === "TEXT") {
      return { ...defaultParams, [TEXT_USAGES_PARAM_KEY]: normalizedUsages };
    }
    const { [TEXT_USAGES_PARAM_KEY]: _textUsages, ...rest } = defaultParams;
    return rest;
  }

  private withTextSystemPrompt(
    category: AIModelCategory,
    defaultParams: Record<string, unknown>,
    systemPrompt?: string,
  ) {
    const normalized = this.normalizeSystemPrompt(
      systemPrompt ?? this.asRecord(defaultParams)[SYSTEM_PROMPT_PARAM_KEY],
    );
    if (category === "TEXT") {
      return normalized
        ? { ...defaultParams, [SYSTEM_PROMPT_PARAM_KEY]: normalized }
        : defaultParams;
    }
    const { [SYSTEM_PROMPT_PARAM_KEY]: _systemPrompt, ...rest } = defaultParams;
    return rest;
  }

  private normalizeTextUsages(value: unknown) {
    const source = Array.isArray(value) ? value : [];
    const usages = source
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
    const unique = [...new Set(usages)];
    return unique.length > 0 ? unique : [...DEFAULT_TEXT_MODEL_USAGES];
  }

  private normalizeSystemPrompt(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
  }

  private textUsagesFromParams(value: unknown, category: AIModelCategory) {
    if (category !== "TEXT") return [];
    return this.normalizeTextUsages(this.asRecord(value)[TEXT_USAGES_PARAM_KEY]);
  }

  private systemPromptFromParams(value: unknown, category: AIModelCategory) {
    if (category !== "TEXT") return undefined;
    return this.normalizeSystemPrompt(this.asRecord(value)[SYSTEM_PROMPT_PARAM_KEY]) || undefined;
  }

  imageModelRequirements(model: Pick<AIModel, "category" | "defaultParams" | "supportsReferenceImages" | "requiresReferenceImages">): ImageModelRequirements {
    if (model.category !== "TEXT2IMAGE") {
      return {
        imageInputMode: null,
        supportsReferenceImages: false,
        requiresReferenceImages: false,
        minReferenceImages: 0,
        maxReferenceImages: 0,
      };
    }

    const defaultParams = this.asRecord(model.defaultParams);
    const configuredMode = this.explicitImageInputMode(defaultParams.imageInputMode);
    const supportsReferenceImages = Boolean(
      model.supportsReferenceImages || model.requiresReferenceImages,
    );
    const requiresReferenceImages =
      supportsReferenceImages && Boolean(model.requiresReferenceImages);
    const maxReferenceImages = supportsReferenceImages
      ? intParam(defaultParams.maxReferenceImages, 5, 1, SEEDREAM_MAX_REFERENCE_IMAGES)
      : 0;
    const minReferenceImages =
      supportsReferenceImages && requiresReferenceImages
        ? intParam(defaultParams.minReferenceImages, 1, 1, maxReferenceImages)
        : 0;
    if (supportsReferenceImages) {
      return {
        imageInputMode: configuredMode ?? "I2I",
        supportsReferenceImages: true,
        requiresReferenceImages,
        minReferenceImages,
        maxReferenceImages,
      };
    }

    return {
      imageInputMode: configuredMode ?? "T2I",
      supportsReferenceImages: false,
      requiresReferenceImages: false,
      minReferenceImages: 0,
      maxReferenceImages: 0,
    };
  }

  private modelReferenceRequirements(
    model: Pick<
      AIModel,
      | "category"
      | "code"
      | "displayName"
      | "modelName"
      | "description"
      | "defaultParams"
      | "supportsReferenceImages"
      | "requiresReferenceImages"
    >,
  ): ImageModelRequirements | VideoModelRequirements {
    if (model.category === "TEXT2IMAGE") return this.imageModelRequirements(model);
    return this.videoModelRequirements(model);
  }

  videoModelRequirements(model: Pick<AIModel, "category" | "code" | "displayName" | "modelName" | "description" | "defaultParams">): VideoModelRequirements {
    if (model.category !== "IMAGE2VIDEO") {
      return {
        videoInputMode: null,
        supportsReferenceImages: false,
        requiresReferenceImages: false,
        minReferenceImages: 0,
        maxReferenceImages: 0,
      };
    }

    const defaultParams = this.asRecord((model as Pick<AIModel, "defaultParams">).defaultParams);
    const configuredMode = this.explicitVideoInputMode(defaultParams.videoInputMode);
    if (configuredMode === "EDIT") {
      return {
        videoInputMode: "EDIT",
        supportsReferenceImages: true,
        requiresReferenceImages: true,
        minReferenceImages: 1,
        maxReferenceImages: 5,
      };
    }
    if (configuredMode === "R2V") {
      return {
        videoInputMode: "R2V",
        supportsReferenceImages: true,
        requiresReferenceImages: true,
        minReferenceImages: 1,
        maxReferenceImages: 5,
      };
    }
    if (configuredMode === "I2V") {
      return {
        videoInputMode: "I2V",
        supportsReferenceImages: true,
        requiresReferenceImages: true,
        minReferenceImages: 1,
        maxReferenceImages: 1,
      };
    }
    if (configuredMode === "T2V") {
      return {
        videoInputMode: "T2V",
        supportsReferenceImages: false,
        requiresReferenceImages: false,
        minReferenceImages: 0,
        maxReferenceImages: 0,
      };
    }

    const marker = `${model.code} ${model.displayName} ${model.modelName} ${model.description ?? ""}`.toLowerCase();
    const isI2V =
      marker.includes("i2v") ||
      marker.includes("interpolation") ||
      marker.includes("image-to-video") ||
      marker.includes("image2video") ||
      marker.includes("图生视频");
    const isR2V =
      marker.includes("r2v") ||
      marker.includes("reference-to-video") ||
      marker.includes("multi-reference") ||
      marker.includes("多图视频");
    const isEdit =
      marker.includes("videoedit") ||
      marker.includes("video-edit") ||
      marker.includes("video edit") ||
      marker.includes("视频编辑");
    const isT2V =
      marker.includes("t2v") ||
      marker.includes("text-to-video") ||
      marker.includes("text2video") ||
      marker.includes("文生视频");

    if (isEdit) {
      return {
        videoInputMode: "EDIT",
        supportsReferenceImages: true,
        requiresReferenceImages: true,
        minReferenceImages: 1,
        maxReferenceImages: 5,
      };
    }
    if (isR2V) {
      return {
        videoInputMode: "R2V",
        supportsReferenceImages: true,
        requiresReferenceImages: true,
        minReferenceImages: 1,
        maxReferenceImages: 5,
      };
    }
    if (isI2V) {
      return {
        videoInputMode: "I2V",
        supportsReferenceImages: true,
        requiresReferenceImages: true,
        minReferenceImages: 1,
        maxReferenceImages: 1,
      };
    }
    if (isT2V) {
      return {
        videoInputMode: "T2V",
        supportsReferenceImages: false,
        requiresReferenceImages: false,
        minReferenceImages: 0,
        maxReferenceImages: 0,
      };
    }

    return {
      videoInputMode: null,
      supportsReferenceImages: false,
      requiresReferenceImages: false,
      minReferenceImages: 0,
      maxReferenceImages: 0,
    };
  }

  private toAdminModel<TModel extends AIModel & { provider?: unknown }>(model: TModel) {
    const { apiKeyEnc: _apiKeyEnc, ...safe } = model;
    const provider = this.sanitizeAdminProvider(safe.provider);
    const providerHasApiKey =
      this.isProviderWithKey(safe.provider) &&
      safe.provider.isActive &&
      this.hasEncryptedKey(safe.provider.apiKeyEnc);
    const hasApiKey = model.providerId ? providerHasApiKey : this.hasEncryptedKey(model.apiKeyEnc);
    return {
      ...safe,
      provider,
      hasApiKey,
      textUsages: this.textUsagesFromParams(model.defaultParams, model.category),
      systemPrompt: this.systemPromptFromParams(model.defaultParams, model.category),
      ...this.modelReferenceRequirements(model),
    };
  }

  private decryptStoredKey(apiKeyEnc: string | null | undefined) {
    if (!apiKeyEnc) return "";
    try {
      return this.crypto.decrypt(apiKeyEnc);
    } catch {
      return apiKeyEnc;
    }
  }

  private hasEncryptedKey(apiKeyEnc: string | null | undefined) {
    return normalizeProviderApiKey(this.decryptStoredKey(apiKeyEnc)).length > 0;
  }

  private isProviderWithKey(
    provider: unknown,
  ): provider is { apiKeyEnc: string; isActive: boolean } {
    return Boolean(
      provider &&
        typeof provider === "object" &&
        "apiKeyEnc" in provider &&
        "isActive" in provider,
    );
  }

  private sanitizeAdminProvider(provider: unknown) {
    if (!provider || typeof provider !== "object") return provider;
    if (!("apiKeyEnc" in provider)) return provider;
    const { apiKeyEnc: _providerApiKeyEnc, ...safeProvider } = provider as Record<string, unknown>;
    return safeProvider;
  }
}
