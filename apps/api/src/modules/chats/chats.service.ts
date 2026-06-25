import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { GenerationJob, OssAsset, Prisma } from "@prisma/client";
import { PrismaService } from "nestjs-prisma";
import { AdvancedAccessService } from "@/common/services/advanced-access.service";
import { OssService } from "../oss/oss.service";
import { GenerationOutputMediaService } from "../generation-output-media/generation-output-media.service";
import {
  loggedPublicGenerationErrorMessage,
  logPublicGenerationErrorResponse,
  publicGenerationErrorMessage,
} from "../generation/generation-errors";
import {
  buildPublicGenerationOutputItems,
  publicProviderOutputUrls,
} from "../generation/generation-output-urls";

type UploadedMedia = {
  buffer?: Buffer;
  mimetype?: string;
  size?: number;
};

const EDITABLE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const EDITABLE_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const EDITABLE_MEDIA_TYPES = new Set([...EDITABLE_IMAGE_TYPES, ...EDITABLE_VIDEO_TYPES]);
const DEFAULT_CHAT_TITLE = "New chat";

function normalizedContentType(value: string | undefined, fallback: string) {
  const contentType = (value || fallback).split(";")[0]?.trim().toLowerCase();
  return contentType || fallback;
}

function parseMetadataRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return asPlainRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return asPlainRecord(value);
}

function asPlainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

function orderedAssets(assetIds: string[], assets: OssAsset[]) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  return assetIds
    .map((id) => byId.get(id))
    .filter((asset): asset is OssAsset => Boolean(asset));
}

function modeFromMetadata(value: unknown) {
  const metadata = asPlainRecord(value);
  const settings = asPlainRecord(metadata.settings);
  return settings.mode === "video" ? "video" : settings.mode === "image" ? "image" : null;
}

function modeForSession(input: {
  jobs?: Array<Pick<GenerationJob, "type">>;
  messages?: Array<{ metadata?: unknown }>;
}) {
  if (input.jobs?.some((job) => job.type === "IMAGE2VIDEO")) return "video";
  if (input.jobs?.some((job) => job.type === "TEXT2IMAGE" || job.type === "IMAGE_EDIT")) return "image";
  const metadataMode = input.messages
    ?.map((message) => modeFromMetadata(message.metadata))
    .find((mode): mode is "image" | "video" => Boolean(mode));
  return metadataMode ?? "image";
}

@Injectable()
export class ChatsService {
  private readonly logger = new Logger(ChatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oss: OssService,
    private readonly advancedAccess: AdvancedAccessService,
    private readonly outputMedia: GenerationOutputMediaService,
  ) {}

  async list(userId: string) {
    const sessions = await this.prisma.chatSession.findMany({
      where: { userId, archived: false },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      include: {
        jobs: {
          orderBy: { createdAt: "desc" },
          select: { id: true, type: true, createdAt: true },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          select: { metadata: true },
          take: 8,
        },
        _count: { select: { messages: true, jobs: true } },
      },
    });
    return sessions.map(({ messages, ...session }) => ({
      ...session,
      mode: modeForSession({ jobs: session.jobs, messages }),
    }));
  }

  async listAdmin(query: {
    userId?: string;
    q?: string;
    skip?: number;
    take?: number;
  }) {
    const q = query.q?.trim();
    const where: Prisma.ChatSessionWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(q
        ? {
            OR: [
              { id: { contains: q } },
              { title: { contains: q } },
              { jobs: { some: { prompt: { contains: q } } } },
              {
                messages: {
                  some: {
                    role: "user",
                    content: { contains: q },
                  },
                },
              },
              {
                user: {
                  OR: [
                    { id: { contains: q } },
                    { email: { contains: q } },
                    { profile: { displayName: { contains: q } } },
                  ],
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.chatSession.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: query.skip ?? 0,
        take: Math.min(query.take ?? 50, 200),
        include: {
          user: {
            select: {
              id: true,
              email: true,
              profile: { select: { displayName: true } },
            },
          },
          _count: { select: { messages: true, jobs: true } },
        },
      }),
      this.prisma.chatSession.count({ where }),
    ]);

    return { items, total };
  }

  async createSession(userId: string, title?: string) {
    // Cleanup stale empty sessions (older than 36h, no user messages, no jobs)
    void this.cleanupStaleEmptySessions().catch((err) =>
      this.logger.error("Failed to cleanup stale sessions", err),
    );
    return this.prisma.chatSession.create({
      data: { userId, title: title?.trim().slice(0, 191) || DEFAULT_CHAT_TITLE },
    });
  }

  private async cleanupStaleEmptySessions() {
    const cutoff = new Date(Date.now() - 36 * 60 * 60 * 1000);
    const { count } = await this.prisma.chatSession.deleteMany({
      where: {
        createdAt: { lt: cutoff },
        messages: { none: { role: "user" } },
        jobs: { none: {} },
      },
    });
    if (count > 0) {
      this.logger.log(`Cleaned up ${count} stale empty sessions older than 36h`);
    }
  }

  async detail(userId: string, sessionId: string, messageLimit?: number) {
    let skip: number | undefined;
    let take: number | undefined;
    if (messageLimit) {
      const total = await this.prisma.chatMessage.count({ where: { sessionId } });
      skip = Math.max(0, total - messageLimit);
      take = messageLimit;
    }
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          ...(messageLimit ? { skip, take } : {}),
          include: { generationJob: true },
        },
      },
    });
    if (!session) throw new NotFoundException();

    const jobs = session.messages
      .map((m) => m.generationJob)
      .filter((job): job is GenerationJob => Boolean(job));
    const modelDisplayNames = await this.modelDisplayNames(jobs);
    const publicJobs = new Map(
      await Promise.all(
        jobs.map(
          async (job) =>
            [
              job.id,
              await this.toPublicJob(
                job,
                modelDisplayNames.get(job.modelCode),
              ),
            ] as const,
        ),
      ),
    );

    const messages = await Promise.all(
      session.messages.map(async (message) => ({
        ...message,
        metadata: message.generationJobId
          ? this.resolveMetadataResultsFromPublicJob(
              message.metadata,
              publicJobs.get(message.generationJobId) ?? null,
            )
          : message.metadata,
        generationJob: message.generationJobId
          ? (publicJobs.get(message.generationJobId) ?? null)
          : null,
      })),
    );

    return {
      ...session,
      mode: modeForSession({
        jobs,
        messages: session.messages,
      }),
      messages,
    };
  }

  async paginateMessages(
    userId: string,
    sessionId: string,
    before?: string,
    limit = 10,
  ) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true },
    });
    if (!session) throw new NotFoundException();

    const where: any = { sessionId };
    if (before) {
      where.createdAt = { lt: new Date(before) };
    }

    const messages = await this.prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      include: { generationJob: true },
    });

    const hasMore = messages.length > limit;
    const items = messages.slice(0, limit).reverse();

    const jobs = items
      .map((m) => m.generationJob)
      .filter((job): job is GenerationJob => Boolean(job));
    const modelDisplayNames = await this.modelDisplayNames(jobs);
    const publicJobs = new Map(
      await Promise.all(
        jobs.map(
          async (job) =>
            [job.id, await this.toPublicJob(job, modelDisplayNames.get(job.modelCode))] as const,
        ),
      ),
    );

    const enriched = await Promise.all(
      items.map(async (message) => ({
        ...message,
        metadata: message.generationJobId
          ? this.resolveMetadataResultsFromPublicJob(
              message.metadata,
              publicJobs.get(message.generationJobId) ?? null,
            )
          : message.metadata,
        generationJob: message.generationJobId
          ? (publicJobs.get(message.generationJobId) ?? null)
          : null,
      })),
    );

    return { messages: enriched, hasMore };
  }

  async detailAdmin(sessionId: string) {
    const session = await this.prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            profile: { select: { displayName: true } },
          },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          include: { generationJob: true },
        },
      },
    });
    if (!session) throw new NotFoundException();

    const jobs = session.messages
      .map((m) => m.generationJob)
      .filter((job): job is GenerationJob => Boolean(job));
    const modelDisplayNames = await this.modelDisplayNames(jobs);
    const publicJobs = new Map(
      await Promise.all(
        jobs.map(
          async (job) =>
            [
              job.id,
              await this.toAdminJob(job, modelDisplayNames.get(job.modelCode)),
            ] as const,
        ),
      ),
    );

    const messages = await Promise.all(
      session.messages.map(async (message) => ({
        ...message,
        metadata: await this.resolveMetadataResults(message.metadata),
        generationJob: message.generationJobId
          ? (publicJobs.get(message.generationJobId) ?? null)
          : null,
      })),
    );

    return {
      ...session,
      messages,
    };
  }

  appendMessage(
    userId: string,
    sessionId: string,
    message: {
      role: string;
      content: string;
      generationJobId?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.chatSession.findFirst({
        where: { id: sessionId, userId },
      });
      if (!session) throw new NotFoundException();
      if (message.generationJobId) {
        const job = await tx.generationJob.findFirst({
          where: {
            id: message.generationJobId,
            userId,
            chatSessionId: sessionId,
          },
          select: { id: true },
        });
        if (!job) throw new NotFoundException();
      }
      await tx.chatSession.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() },
      });
      return tx.chatMessage.create({
        data: {
          sessionId,
          role: message.role,
          content: message.content,
          generationJobId: message.generationJobId,
          metadata: (message.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    });
  }

  async appendEditedResult(
    userId: string,
    sessionId: string,
    messageId: string,
    input: { sourceResultId?: string; file?: UploadedMedia },
  ) {
    const file = input.file;
    const contentType = normalizedContentType(file?.mimetype, "image/png");
    if (!file?.buffer?.length)
      throw new BadRequestException("MEDIA_FILE_REQUIRED");
    if (!EDITABLE_MEDIA_TYPES.has(contentType))
      throw new BadRequestException("UNSUPPORTED_MEDIA_TYPE");
    const kind = EDITABLE_VIDEO_TYPES.has(contentType) ? "video" : "image";

    const message = await this.prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        sessionId,
        session: { userId },
      },
    });
    if (!message) throw new NotFoundException();
    if (message.role !== "assistant")
      throw new BadRequestException("EDIT_TARGET_NOT_ASSISTANT");

    const { key, asset } = await this.oss.putBuffer(
      `studio-edits/${userId}/${sessionId}`,
      file.buffer,
      contentType,
      { userId, visibility: "PRIVATE", requireUpload: true },
    );
    const createdAt = new Date();
    const src =
      (await this.oss.signGet(key, 24 * 3600)) ?? this.oss.contentUrl(key);
    const result = {
      id: asset.id,
      src,
      url: src,
      key,
      assetId: asset.id,
      kind,
      prompt: message.content,
      sourceResultId: input.sourceResultId ?? null,
      edited: true,
      createdAt: createdAt.toISOString(),
    };

    const metadata = asPlainRecord(message.metadata);
    const existingResults = Array.isArray(metadata.results)
      ? metadata.results
      : [];
    await this.prisma.$transaction([
      this.prisma.chatMessage.update({
        where: { id: message.id },
        data: {
          metadata: {
            ...metadata,
            results: [...existingResults, result],
          } as Prisma.InputJsonValue,
        },
      }),
      this.prisma.chatSession.update({
        where: { id: sessionId },
        data: { updatedAt: createdAt },
      }),
    ]);

    return {
      id: asset.id,
      src,
      kind,
      prompt: message.content,
      sourceResultId: input.sourceResultId ?? null,
      createdAt: createdAt.getTime(),
    };
  }

  async appendMediaResult(
    userId: string,
    sessionId: string,
    input: {
      content: string;
      metadata?: unknown;
      sourceResultId?: string;
      file?: UploadedMedia;
    },
  ) {
    const file = input.file;
    const contentType = normalizedContentType(file?.mimetype, "video/webm");
    if (!file?.buffer?.length)
      throw new BadRequestException("MEDIA_FILE_REQUIRED");
    if (!EDITABLE_MEDIA_TYPES.has(contentType))
      throw new BadRequestException("UNSUPPORTED_MEDIA_TYPE");
    const kind = EDITABLE_VIDEO_TYPES.has(contentType) ? "video" : "image";

    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
      select: { id: true },
    });
    if (!session) throw new NotFoundException();

    const { key, asset } = await this.oss.putBuffer(
      `studio-edits/${userId}/${sessionId}`,
      file.buffer,
      contentType,
      { userId, visibility: "PRIVATE", requireUpload: true },
    );
    const createdAt = new Date();
    const src =
      (await this.oss.signGet(key, 24 * 3600)) ?? this.oss.contentUrl(key);
    const metadata = parseMetadataRecord(input.metadata);
    const sourceResultIds = Array.isArray(metadata.sourceResultIds)
      ? metadata.sourceResultIds.filter((id): id is string => typeof id === "string")
      : [];
    const result = {
      id: asset.id,
      src,
      url: src,
      key,
      assetKey: key,
      assetId: asset.id,
      kind,
      prompt: input.content,
      sourceResultId: input.sourceResultId ?? null,
      sourceResultIds,
      merged: Boolean(metadata.merged),
      label: typeof metadata.label === "string" ? metadata.label : null,
      edited: true,
      createdAt: createdAt.toISOString(),
    };

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: {
          sessionId,
          role: "assistant",
          content: input.content,
          metadata: {
            ...metadata,
            status: metadata.status ?? "done",
            results: [result],
          } as Prisma.InputJsonValue,
        },
      });
      await tx.chatSession.update({
        where: { id: sessionId },
        data: { updatedAt: createdAt },
      });
      return created;
    });

    return {
      id: asset.id,
      src,
      kind,
      prompt: input.content,
      sourceResultId: input.sourceResultId ?? null,
      createdAt: createdAt.getTime(),
      messageId: message.id,
    };
  }

  async update(
    userId: string,
    sessionId: string,
    data: { title?: string; pinned?: boolean; archived?: boolean },
  ) {
    const existing = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!existing) throw new NotFoundException();

    return this.prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        ...(data.title !== undefined
          ? { title: data.title.trim().slice(0, 191) || DEFAULT_CHAT_TITLE }
          : {}),
        ...(data.pinned !== undefined ? { pinned: data.pinned } : {}),
        ...(data.archived !== undefined ? { archived: data.archived } : {}),
      },
    });
  }

  archive(userId: string, sessionId: string) {
    return this.prisma.chatSession.updateMany({
      where: { id: sessionId, userId },
      data: { archived: true },
    });
  }

  delete(userId: string, sessionId: string) {
    return this.prisma.chatSession.updateMany({
      where: { id: sessionId, userId },
      data: { archived: true },
    });
  }

  private async modelDisplayNames(jobs: GenerationJob[]) {
    const modelCodes = [...new Set(jobs.map((job) => job.modelCode))];
    if (!modelCodes.length) return new Map<string, string>();
    const models = await this.prisma.aIModel.findMany({
      where: { code: { in: modelCodes } },
      select: { code: true, displayName: true },
    });
    return new Map(models.map((model) => [model.code, model.displayName]));
  }

  private async toPublicJob(job: GenerationJob, modelDisplayName?: string) {
    // Terminal jobs need no asset fetching or URL signing — just return a lightweight snapshot.
    if (job.status === "failed" || job.status === "canceled") {
      return {
        id: job.id,
        type: job.type,
        status: job.status,
        prompt: job.prompt,
        modelCode: job.modelCode,
        modelDisplayName: modelDisplayName ?? null,
        params: (job.params as Record<string, unknown>) ?? {},
        progress: job.progress,
        costCredits: job.costCredits,
        outputUrls: [],
        providerOutputUrls: [],
        providerJobId: job.providerJobId,
        outputItems: [],
        chatSessionId: job.chatSessionId,
        errorMessage: publicGenerationErrorMessage(job.errorMessage, null),
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
      };
    }

    const assetIds = (job.outputAssetIds as string[] | null) ?? [];
    const providerOutputUrls = stringArray(job.providerOutputUrls);
    const assets = assetIds.length
      ? await this.prisma.ossAsset.findMany({ where: { id: { in: assetIds } } })
      : ([] as OssAsset[]);
    const assetOutputs = await Promise.all(
      orderedAssets(assetIds, assets).map(async (asset) => ({
        asset,
        assetUrl: await this.oss.signGet(asset.key, 24 * 3600),
      })),
    );
    const count = Math.max(assetOutputs.length, providerOutputUrls.length);
    const hasAdvancedAccess = await this.advancedAccess.hasAdvancedAccess(job.userId);
    const outputItems = await Promise.all(buildPublicGenerationOutputItems(
      job.id,
      job.type,
      Array.from({ length: count }, (_, index) => ({
        asset: assetOutputs[index]?.asset,
        assetUrl: assetOutputs[index]?.assetUrl ?? null,
        providerUrl: providerOutputUrls[index] ?? null,
      })),
      hasAdvancedAccess,
    ).map(async (item, index) => {
      const asset = assetOutputs[index]?.asset;
      if (!asset) return item;
      const ref = await this.outputMedia.publicRefForAsset({
        userId: job.userId,
        jobId: job.id,
        outputIndex: index,
        type: job.type,
        asset,
        assetUrl: item.url,
        hasAdvancedAccess,
      });
      return {
        ...item,
        url: ref.url ?? item.url,
        thumbnailUrl:
          job.type === "TEXT2IMAGE" || job.type === "IMAGE_EDIT"
            ? this.outputMedia.thumbnailUrl(ref.mediaId)
            : null,
        mediaId: ref.mediaId,
      };
    }));

    return {
      id: job.id,
      type: job.type,
      status: job.status,
      prompt: job.prompt,
      modelCode: job.modelCode,
      modelDisplayName: modelDisplayName ?? null,
      params: (job.params as Record<string, unknown>) ?? {},
      progress: job.progress,
      costCredits: job.costCredits,
      outputUrls: outputItems.map((item) => item.url),
      providerOutputUrls: publicProviderOutputUrls(
        job.type,
        providerOutputUrls,
        hasAdvancedAccess,
      ),
      providerJobId: job.providerJobId,
      outputItems,
      chatSessionId: job.chatSessionId,
      errorMessage: loggedPublicGenerationErrorMessage(
        job.errorMessage,
        this.logger,
        `Chat generation job snapshot ${job.id} status=${job.status} user=${job.userId} model=${job.modelCode}`,
        null,
      ),
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    };
  }

  private async toAdminJob(job: GenerationJob, modelDisplayName?: string) {
    if (job.status === "failed" || job.status === "canceled") {
      return {
        id: job.id,
        type: job.type,
        status: job.status,
        prompt: job.prompt,
        modelCode: job.modelCode,
        modelDisplayName: modelDisplayName ?? null,
        progress: job.progress,
        params: job.params,
        inputAssetKey: job.inputAssetKey,
        outputAssetIds: [],
        outputAssets: [],
        outputUrls: [],
        providerOutputUrls: [],
        providerJobId: job.providerJobId,
        outputItems: [],
        costCredits: job.costCredits,
        chatSessionId: job.chatSessionId,
        errorMessage: publicGenerationErrorMessage(job.errorMessage, null),
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
      };
    }

    const assetIds = (job.outputAssetIds as string[] | null) ?? [];
    const providerOutputUrls = stringArray(job.providerOutputUrls);
    const assets = assetIds.length
      ? await this.prisma.ossAsset.findMany({ where: { id: { in: assetIds } } })
      : ([] as OssAsset[]);
    const ordered = orderedAssets(assetIds, assets);
    const assetOutputs = await Promise.all(
      ordered.map(async (asset) => ({
        asset,
        assetUrl: await this.oss.signGet(asset.key, 24 * 3600),
      })),
    );
    const count = Math.max(assetOutputs.length, providerOutputUrls.length);
    const outputItems = buildPublicGenerationOutputItems(
      job.id,
      job.type,
      Array.from({ length: count }, (_, index) => ({
        asset: assetOutputs[index]?.asset,
        assetUrl: assetOutputs[index]?.assetUrl ?? null,
        providerUrl: providerOutputUrls[index] ?? null,
      })),
      true,
    );

    return {
      id: job.id,
      type: job.type,
      status: job.status,
      prompt: job.prompt,
      modelCode: job.modelCode,
      modelDisplayName: modelDisplayName ?? null,
      progress: job.progress,
      params: job.params,
      inputAssetKey: job.inputAssetKey,
      outputAssetIds: assetIds,
      outputAssets: assetOutputs.map(({ asset, assetUrl }, index) => ({
        id: asset.id,
        key: asset.key,
        contentType: asset.contentType,
        url: assetUrl,
        sourceUrl: providerOutputUrls[index] ?? null,
      })),
      outputUrls: outputItems.map((item) => item.url),
      providerOutputUrls,
      providerJobId: job.providerJobId,
      outputItems,
      costCredits: job.costCredits,
      chatSessionId: job.chatSessionId,
      errorMessage: this.logAdminJobErrorMessage(job),
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    };
  }

  private logAdminJobErrorMessage(job: GenerationJob) {
    logPublicGenerationErrorResponse(
      this.logger,
      `Admin chat generation job snapshot ${job.id} status=${job.status} user=${job.userId} model=${job.modelCode}`,
      job.errorMessage,
    );
    return job.errorMessage;
  }

  private async resolveMetadataResults(metadata: unknown) {
    const record = asPlainRecord(metadata);
    const rawResults = record.results;
    if (!Array.isArray(rawResults)) return metadata;

    const results = await Promise.all(
      rawResults.map(async (item) => {
        if (typeof item === "string") {
          const key = this.oss.assetKeyFromUrl(item);
          return key
            ? ((await this.oss.signGet(key, 24 * 3600)) ?? item)
            : item;
        }
        if (!item || typeof item !== "object" || Array.isArray(item))
          return item;
        const result = item as Record<string, unknown>;
        const existingSrc =
          typeof result.src === "string"
            ? result.src
            : typeof result.url === "string"
              ? result.url
              : undefined;
        const key =
          typeof result.key === "string"
            ? result.key
            : typeof result.assetKey === "string"
              ? result.assetKey
              : this.oss.assetKeyFromUrl(existingSrc);
        if (!key) return item;
        const signed = await this.oss.signGet(key, 24 * 3600);
        if (!signed) return item;
        return {
          ...result,
          key,
          assetKey: typeof result.assetKey === "string" ? result.assetKey : key,
          src: signed,
          url: signed,
        };
      }),
    );

    return { ...record, results };
  }

  private resolveMetadataResultsFromPublicJob(
    metadata: unknown,
    job: { outputItems?: Array<{ url: string; fallbackUrl?: string | null; sourceUrl?: string | null; mediaId?: string | null; assetId?: string | null; assetKey?: string | null }> } | null,
  ) {
    const record = asPlainRecord(metadata);
    const rawResults = record.results;
    if (!Array.isArray(rawResults) || !job?.outputItems?.length) return metadata;

    const results = rawResults.map((item, index) => {
      const output = job.outputItems?.[index];
      if (!output?.url) return item;
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return output.url;
      }
      const result = item as Record<string, unknown>;
      return {
        ...result,
        src: output.url,
        url: output.url,
        fallbackUrl: output.fallbackUrl,
        sourceUrl: output.sourceUrl,
        mediaId: output.mediaId,
        assetId: output.assetId,
        assetKey: output.assetKey,
      };
    });

    return { ...record, results };
  }
}
