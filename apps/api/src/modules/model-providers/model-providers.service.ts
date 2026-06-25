import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "nestjs-prisma";
import { CryptoService } from "@/common/services/crypto.service";
import type { Prisma } from "@prisma/client";

export type ModelProviderApiStyle = "OPENAI" | "CREX" | "VOLCENGINE";
export type Text2ImageProviderApiStyle = ModelProviderApiStyle;

export interface ModelProviderUpsertInput {
  id?: string;
  code: string;
  name: string;
  baseUrl: string;
  apiStyle?: ModelProviderApiStyle;
  statusUrl?: string | null;
  maxPollDurationMs?: number | null;
  pollIntervalMs?: number | null;
  maxPollAttempts?: number | null;
  apiKey?: string;
  extra?: Record<string, unknown>;
  isActive?: boolean;
  sortOrder?: number;
}

export interface ResolvedModelProvider {
  id: string;
  code: string;
  name: string;
  baseUrl: string;
  apiStyle: ModelProviderApiStyle;
  statusUrl: string | null;
  maxPollDurationMs: number;
  pollIntervalMs: number;
  maxPollAttempts: number;
  apiKey: string;
  extra: Record<string, unknown>;
}

function normalizeProviderApiKey(value: string) {
  return value.trim().replace(/^Bearer\s+/i, "").trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanOptionalString(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

function normalizeProviderApiStyle(
  value: unknown,
  baseUrl?: string,
): ModelProviderApiStyle {
  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();
    if (normalized === "VOLCENGINE") return "VOLCENGINE";
    if (normalized === "CREX") return "CREX";
    if (normalized === "OPENAI") return "OPENAI";
  }
  const marker = (baseUrl ?? "").toLowerCase();
  if (
    marker.includes("volces.com") ||
    marker.includes("volcengine.com") ||
    marker.includes("ark.cn-beijing")
  ) {
    return "VOLCENGINE";
  }
  if (
    marker.includes("crex.cn") ||
    marker.includes("bpi.") ||
    marker.includes("gpt2api") ||
    marker.includes("chatgpt2api")
  ) {
    return "CREX";
  }
  return "OPENAI";
}

function normalizePositiveInt(
  value: number | null | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

@Injectable()
export class ModelProvidersService implements OnModuleInit {
  private readonly logger = new Logger(ModelProvidersService.name);
  private defaultsSynced = false;
  private defaultsSyncPromise: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  onModuleInit() {
    void this.ensureDefaults();
  }

  async listAdmin() {
    await this.ensureDefaults();
    const providers = await this.prisma.modelProviderConfig.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return providers.map((provider) => this.toSafeProvider(provider));
  }

  async listPublic() {
    await this.ensureDefaults();
    const providers = await this.prisma.modelProviderConfig.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
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
        sortOrder: true,
      },
    });
    return providers;
  }

  async upsert(input: ModelProviderUpsertInput) {
    await this.ensureDefaults();
    const apiKeyEnc =
      input.apiKey !== undefined
        ? this.crypto.encrypt(normalizeProviderApiKey(input.apiKey))
        : undefined;
    const data = {
      code: input.code.trim(),
      name: input.name.trim(),
      baseUrl: input.baseUrl.trim() || "https://api.magickapi.com",
      apiStyle: normalizeProviderApiStyle(input.apiStyle, input.baseUrl),
      statusUrl: cleanOptionalString(input.statusUrl),
      maxPollDurationMs: normalizePositiveInt(
        input.maxPollDurationMs,
        15 * 60_000,
        60_000,
        24 * 60 * 60_000,
      ),
      pollIntervalMs: normalizePositiveInt(
        input.pollIntervalMs,
        5000,
        500,
        60_000,
      ),
      maxPollAttempts: normalizePositiveInt(
        input.maxPollAttempts,
        180,
        1,
        10_000,
      ),
      extra: (input.extra ?? {}) as Prisma.InputJsonValue,
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0,
      ...(apiKeyEnc !== undefined ? { apiKeyEnc } : {}),
    };

    const provider = input.id
      ? await this.prisma.modelProviderConfig.update({
          where: { id: input.id },
          data,
        })
      : await this.prisma.modelProviderConfig.upsert({
          where: { code: data.code },
          update: data,
          create: {
            ...data,
            apiKeyEnc: apiKeyEnc ?? this.crypto.encrypt(""),
          },
        });

    return this.toSafeProvider(provider);
  }

  async delete(code: string) {
    const provider = await this.prisma.modelProviderConfig.delete({
      where: { code },
    });
    return this.toSafeProvider(provider);
  }

  async resolve(id: string | null | undefined): Promise<ResolvedModelProvider | null> {
    if (!id) return null;
    await this.ensureDefaults();
    const provider = await this.prisma.modelProviderConfig.findUnique({
      where: { id },
    });
    if (!provider || !provider.isActive) return null;
    return {
      id: provider.id,
      code: provider.code,
      name: provider.name,
      baseUrl: provider.baseUrl.trim(),
      apiStyle: provider.apiStyle,
      statusUrl: provider.statusUrl,
      maxPollDurationMs: provider.maxPollDurationMs,
      pollIntervalMs: provider.pollIntervalMs,
      maxPollAttempts: provider.maxPollAttempts,
      apiKey: normalizeProviderApiKey(this.crypto.decrypt(provider.apiKeyEnc)),
      extra: asRecord(provider.extra),
    };
  }

  private async ensureDefaults() {
    if (this.defaultsSynced) return;
    if (!this.defaultsSyncPromise) {
      this.defaultsSyncPromise = this.syncDefaults()
        .then(() => {
          this.defaultsSynced = true;
        })
        .catch((err) => {
          this.logger.error(
            `Failed to sync default model provider: ${(err as Error).message}`,
          );
        })
        .finally(() => {
          this.defaultsSyncPromise = null;
        });
    }
    await this.defaultsSyncPromise;
  }

  private async syncDefaults() {
    const magickExisting = await this.prisma.modelProviderConfig.findUnique({
      where: { code: "magickapi" },
      select: { id: true },
    });
    if (!magickExisting) {
      const apiKey =
        process.env.DEFAULT_AI_TEXT2IMAGE_API_KEY ??
        process.env.DEFAULT_AI_IMAGE2VIDEO_API_KEY ??
        process.env.CHAT_GPT_KEY ??
        process.env.VITE_CHAT_GPT_KEY ??
        "";
      await this.prisma.modelProviderConfig.create({
        data: {
          code: "magickapi",
          name: "MagickAPI",
          baseUrl: "https://api.magickapi.com",
          apiStyle: "OPENAI",
          statusUrl: null,
          maxPollDurationMs: 15 * 60_000,
          pollIntervalMs: 5000,
          maxPollAttempts: 180,
          apiKeyEnc: this.crypto.encrypt(apiKey),
          extra: {} as Prisma.InputJsonValue,
          isActive: true,
          sortOrder: 0,
        },
      });
    }

    const volcengineKey =
      process.env.VOLCENGINE_API_KEY ??
      process.env.ARK_API_KEY ??
      process.env.DEFAULT_VOLCENGINE_API_KEY ??
      "";
    await this.prisma.modelProviderConfig.upsert({
      where: { code: "volcengine" },
      update: {
        name: "Volcengine Ark",
        baseUrl: "https://ark.cn-beijing.volces.com",
        apiStyle: "VOLCENGINE",
        statusUrl: null,
        maxPollDurationMs: 30 * 60_000,
        pollIntervalMs: 5000,
        maxPollAttempts: 360,
        extra: { apiStyle: "volcengine-video" } as Prisma.InputJsonValue,
        isActive: true,
        sortOrder: 10,
        ...(volcengineKey ? { apiKeyEnc: this.crypto.encrypt(volcengineKey) } : {}),
      },
      create: {
        code: "volcengine",
        name: "Volcengine Ark",
        baseUrl: "https://ark.cn-beijing.volces.com",
        apiStyle: "VOLCENGINE",
        statusUrl: null,
        maxPollDurationMs: 30 * 60_000,
        pollIntervalMs: 5000,
        maxPollAttempts: 360,
        apiKeyEnc: this.crypto.encrypt(volcengineKey),
        extra: { apiStyle: "volcengine-video" } as Prisma.InputJsonValue,
        isActive: true,
        sortOrder: 10,
      },
    });
  }

  private toSafeProvider(provider: {
    id: string;
    code: string;
    name: string;
    baseUrl: string;
    apiStyle: ModelProviderApiStyle;
    statusUrl: string | null;
    maxPollDurationMs: number;
    pollIntervalMs: number;
    maxPollAttempts: number;
    apiKeyEnc: string;
    extra: Prisma.JsonValue | null;
    isActive: boolean;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    let hasApiKey = false;
    try {
      hasApiKey = Boolean(this.crypto.decrypt(provider.apiKeyEnc));
    } catch {
      hasApiKey = Boolean(provider.apiKeyEnc);
    }
    const { apiKeyEnc: _apiKeyEnc, ...safe } = provider;
    return {
      ...safe,
      extra: asRecord(provider.extra),
      hasApiKey,
    };
  }
}
