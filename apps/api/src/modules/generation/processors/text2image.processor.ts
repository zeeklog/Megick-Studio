import { Processor, WorkerHost } from "@nestjs/bullmq";
import { BadRequestException, Logger } from "@nestjs/common";
import { DelayedError, Job } from "bullmq";
import { PrismaService } from "nestjs-prisma";
import { OssService } from "../../oss/oss.service";
import { CreditsService } from "../../credits/credits.service";
import { AiModelsService } from "../../ai-models/ai-models.service";
import { AiImageEditModesService } from "../../ai-image-edit-modes/ai-image-edit-modes.service";
import {
  ModelProvidersService,
  type ModelProviderApiStyle,
} from "../../model-providers/model-providers.service";
import {
  GenerationProviderClient,
  Text2ImageTaskStillRunningError,
} from "../generation-provider.client";
import { GenerationOutputMediaService } from "../../generation-output-media/generation-output-media.service";
import { providerUrlForItem } from "../generation-provider.types";
import {
  formatImageSize,
  isBflImageEditParams,
  prepareBflImageEditPair,
} from "../bfl-image-edit";
import {
  generationErrorLogMessage,
  generationErrorLogStack,
  loggedPublicGenerationErrorMessage,
} from "../generation-errors";
import { GENERATION_QUEUE } from "../generation.constants";
import { Image2VideoProcessor } from "./image2video.processor";

const TERMINAL_STATUSES = new Set(["succeeded", "failed", "canceled"]);
const TEXT2IMAGE_WORKER_CONCURRENCY = 100;
const TEXT2IMAGE_REPOLL_DELAY_MS = 30_000;
const TEXT2IMAGE_USER_LIMIT_RETRY_DELAY_MS = 5_000;
const TEXT2IMAGE_WORKER_POLL_ATTEMPTS = 3;
const TEXT2IMAGE_USER_RUNNING_LIMIT = 3;
const TEXT2IMAGE_STALE_RUNNING_MS = 30 * 60 * 1000;
const DEFAULT_TEXT2IMAGE_MAX_POLL_DURATION_MS = 15 * 60 * 1000;

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

function stringArraySlots(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : ""));
}

function dataUrlToBuffer(value: string) {
  const match = value.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  return { contentType: match[1], buffer: Buffer.from(match[2], "base64") };
}

function text2ImageReferences(params: Record<string, unknown>) {
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

function text2ImageReferenceMediaIds(params: Record<string, unknown>) {
  const snakeCase = stringArraySlots(params.reference_media_ids);
  return snakeCase.length ? snakeCase : stringArraySlots(params.referenceMediaIds);
}

function hasText2ImageReferenceMediaIds(params: Record<string, unknown>) {
  return Array.isArray(params.reference_media_ids) || Array.isArray(params.referenceMediaIds);
}

function imageEditReferences(params: Record<string, unknown>) {
  return [
    ...text2ImageReferences(params),
    ...(typeof params.input_image === "string" ? [params.input_image] : []),
    ...(typeof params.inputImage === "string" ? [params.inputImage] : []),
    ...(typeof params.image === "string" ? [params.image] : []),
    ...(typeof params.image_url === "string" ? [params.image_url] : []),
    ...(typeof params.imageUrl === "string" ? [params.imageUrl] : []),
    ...(typeof params.mask === "string" ? [params.mask] : []),
    ...(typeof params.mask_url === "string" ? [params.mask_url] : []),
    ...(typeof params.maskUrl === "string" ? [params.maskUrl] : []),
  ].filter(
    (item, index, items) => item.trim() && items.indexOf(item) === index,
  );
}

function numberParam(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeApiStyle(value: unknown): ModelProviderApiStyle {
  if (value === "VOLCENGINE") return "VOLCENGINE";
  return value === "CREX" ? "CREX" : "OPENAI";
}

function pollNumberParam(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function applyProviderPollConfig(
  params: Record<string, unknown>,
  input: {
    apiStyle: ModelProviderApiStyle;
    statusUrl: string | null;
    maxPollDurationMs: number;
    pollIntervalMs: number;
    maxPollAttempts: number;
  },
) {
  return {
    ...params,
    apiStyle: params.apiStyle ?? input.apiStyle,
    statusUrl: params.statusUrl ?? input.statusUrl ?? undefined,
    maxPollDurationMs: params.maxPollDurationMs ?? input.maxPollDurationMs,
    pollIntervalMs: params.pollIntervalMs ?? input.pollIntervalMs,
    pollAttempts: params.pollAttempts ?? input.maxPollAttempts,
  };
}

function maxPollDurationMs(params: Record<string, unknown>) {
  return Math.max(
    60_000,
    Math.min(
      24 * 60 * 60_000,
      Math.round(
        numberParam(params.maxPollDurationMs, DEFAULT_TEXT2IMAGE_MAX_POLL_DURATION_MS),
      ),
    ),
  );
}

function backgroundPollParams(params: Record<string, unknown>) {
  const pollAttempts = Math.max(
    1,
    Math.min(
      TEXT2IMAGE_WORKER_POLL_ATTEMPTS,
      Math.round(numberParam(params.pollAttempts, TEXT2IMAGE_WORKER_POLL_ATTEMPTS)),
    ),
  );
  const successNoResultAttempts = Math.max(
    1,
    Math.min(
      pollAttempts,
      Math.round(numberParam(params.successNoResultAttempts, pollAttempts)),
    ),
  );
  return {
    ...params,
    pollAttempts,
    successNoResultAttempts,
  };
}

function providerFailureDiagnostic(input: {
  jobId: string;
  userId: string;
  modelCode: string;
  invocation?: {
    providerId: string | null;
    baseUrl: string;
    apiStyle: ModelProviderApiStyle;
    statusUrl: string | null;
    modelName: string;
    params: Record<string, unknown>;
  };
}) {
  const params = input.invocation?.params ?? {};
  return JSON.stringify({
    jobId: input.jobId,
    userId: input.userId,
    modelCode: input.modelCode,
    providerId: input.invocation?.providerId ?? null,
    baseUrl: input.invocation?.baseUrl ?? null,
    statusUrl: input.invocation?.statusUrl ?? null,
    apiStyle: input.invocation?.apiStyle ?? null,
    providerModelName: input.invocation?.modelName ?? null,
    params: {
      apiStyle: params.apiStyle,
      stream: params.stream,
      async: params.async,
      requestTimeoutMs: params.requestTimeoutMs,
      connectTimeoutMs: params.connectTimeoutMs ?? params.upstreamConnectTimeoutMs,
      pollIntervalMs: params.pollIntervalMs,
      pollAttempts: params.pollAttempts,
      maxPollDurationMs: params.maxPollDurationMs,
    },
  });
}

@Processor(GENERATION_QUEUE, { name: "TEXT2IMAGE", concurrency: TEXT2IMAGE_WORKER_CONCURRENCY })
export class Text2ImageProcessor extends WorkerHost {
  private readonly logger = new Logger(Text2ImageProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oss: OssService,
    private readonly credits: CreditsService,
    private readonly models: AiModelsService,
    private readonly imageEditModes: AiImageEditModesService,
    private readonly providers: ModelProvidersService,
    private readonly provider: GenerationProviderClient,
    private readonly image2Video: Image2VideoProcessor,
    private readonly outputMedia: GenerationOutputMediaService,
  ) {
    super();
  }

  async process(job: Job<{ jobId: string }>): Promise<unknown> {
    const { jobId } = job.data;
    const dbJob = await this.prisma.generationJob.findUnique({
      where: { id: jobId },
      include: { model: true },
    });
    if (!dbJob) return { error: "Job not found" };
    if (dbJob.type === "IMAGE2VIDEO") return this.image2Video.process(job);
    if (dbJob.type !== "TEXT2IMAGE" && dbJob.type !== "IMAGE_EDIT") {
      return { skipped: true, type: dbJob.type };
    }
    if (TERMINAL_STATUSES.has(dbJob.status)) {
      return { skipped: true, status: dbJob.status };
    }
    const existingProviderJobId =
      typeof dbJob.providerJobId === "string" && dbJob.providerJobId.trim()
        ? dbJob.providerJobId.trim()
        : undefined;
    const claimResult = await this.claimRunningSlot({
      id: dbJob.id,
      userId: dbJob.userId,
      progress: dbJob.progress,
      startedAt: dbJob.startedAt,
      existingProviderJobId,
    });
    if (claimResult === "limited") {
      await job.moveToDelayed(
        Date.now() + TEXT2IMAGE_USER_LIMIT_RETRY_DELAY_MS,
        job.token,
      );
      throw new DelayedError();
    }
    if (claimResult === "skipped") {
      const current = await this.prisma.generationJob.findUnique({
        where: { id: jobId },
        select: { status: true },
      });
      return { skipped: true, status: current?.status ?? dbJob.status };
    }
    let activeProviderParams = asRecord(dbJob.providerParamsSnapshot);
    let activeInvocation:
      | {
          providerId: string | null;
          baseUrl: string;
          apiStyle: ModelProviderApiStyle;
          statusUrl: string | null;
          modelName: string;
          params: Record<string, unknown>;
        }
      | undefined;
    try {
      const invocation = await this.text2ImageInvocationForJob(dbJob);
      activeInvocation = invocation;
      activeProviderParams = invocation.params;
      const normalizedParams =
        dbJob.type === "TEXT2IMAGE" &&
        !this.models.imageModelRequirements(dbJob.model).supportsReferenceImages
          ? {
              ...activeProviderParams,
              reference_images: undefined,
              referenceImages: undefined,
              reference_media_ids: undefined,
              referenceMediaIds: undefined,
              image_urls: undefined,
              imageUrls: undefined,
              images: undefined,
              image: undefined,
              image_url: undefined,
              imageUrl: undefined,
              input_reference: undefined,
              reference_image: undefined,
              referenceImage: undefined,
            }
          : activeProviderParams;
      const providerParams = await this.resolveReferenceImages(
        dbJob.userId,
        dbJob.id,
        normalizedParams,
        dbJob.type,
      );
      activeProviderParams = backgroundPollParams(providerParams);
      const throwIfNoLongerRunning = async (providerJobId?: string) => {
        const current = await this.prisma.generationJob.findUnique({
          where: { id: dbJob.id },
          select: { status: true },
        });
        if (current?.status === "running") return;
        throw new Text2ImageTaskStillRunningError(
          providerJobId ?? existingProviderJobId ?? dbJob.providerJobId ?? dbJob.id,
          `Local image generation job ${dbJob.id} is no longer running`,
        );
      };
      const items = await this.provider.text2image({
        apiKey: invocation.apiKey,
        baseUrl: invocation.baseUrl,
        apiStyle: invocation.apiStyle,
        statusUrl: invocation.statusUrl,
        modelName: invocation.modelName,
        prompt: dbJob.prompt,
        params: activeProviderParams,
        existingProviderJobId,
        onProviderJobId: async (providerJobId) => {
          await this.prisma.generationJob.updateMany({
            where: { id: dbJob.id, status: "running" },
            data: { providerJobId },
          });
          await throwIfNoLongerRunning(providerJobId);
        },
        onProgress: async (progress) => {
          await this.updateRunningProgress(dbJob.id, progress);
          await throwIfNoLongerRunning();
        },
      });

      const assetIds: string[] = [];
      const providerOutputUrls: string[] = [];
      const providerJobId = items
        .map((item) => item.providerJobId)
        .find((value): value is string => Boolean(value));
      const rememberProviderUrl = (url: string | undefined) => {
        if (url && !providerOutputUrls.includes(url))
          providerOutputUrls.push(url);
      };
      for (const it of items) {
        const providerUrl = providerUrlForItem(it);
        rememberProviderUrl(providerUrl);

        let materialized: typeof it | null = null;
        try {
          materialized = await this.provider.materialize(
            it,
            it.contentType ?? "image/png",
          );
        } catch (downloadErr) {
          this.logger.warn(
            `Generated image download failed for job ${dbJob.id}: ${(downloadErr as Error).message}`,
          );
          if (it.requireOssPersistence) {
            throw downloadErr;
          }
          continue;
        }
        rememberProviderUrl(materialized.url ?? providerUrl);
        if (!materialized.bytes) {
          if (it.requireOssPersistence) {
            throw new Error(
              "Provider output could not be materialized for OSS persistence",
            );
          }
          continue;
        }
        try {
          const { asset } = await this.oss.putBuffer(
            `generations/${dbJob.userId}/${dbJob.id}`,
            materialized.bytes,
            materialized.contentType ?? "image/png",
            {
              userId: dbJob.userId,
              visibility: "PRIVATE",
              requireUpload: true,
            },
          );
          const outputIndex = assetIds.length;
          assetIds.push(asset.id);
          await this.outputMedia.ensureForAsset({
            userId: dbJob.userId,
            jobId: dbJob.id,
            outputIndex,
            assetId: asset.id,
          });
        } catch (uploadErr) {
          this.logger.error(
            `OSS upload failed for text2image job ${dbJob.id}: ${(uploadErr as Error).message}`,
          );
          if (it.requireOssPersistence) throw uploadErr;
          if (!providerUrl) throw uploadErr;
        }
      }

      if (!assetIds.length) {
        throw new Error("Provider returned no downloadable image outputs");
      }

      const completed = await this.prisma.generationJob.updateMany({
        where: { id: jobId, status: "running" },
        data: {
          status: "succeeded",
          progress: 100,
          outputAssetIds: assetIds,
          providerOutputUrls,
          providerJobId,
          errorMessage: null,
          finishedAt: new Date(),
        },
      });
      if (completed.count === 0) {
        const current = await this.prisma.generationJob.findUnique({
          where: { id: jobId },
          select: { status: true },
        });
        return { skipped: true, status: current?.status ?? dbJob.status };
      }
      return { ok: true, assetIds, providerOutputUrls };
    } catch (err) {
      if (
        err instanceof Text2ImageTaskStillRunningError &&
        !this.hasExceededPollWallClock(dbJob, activeProviderParams)
      ) {
        const delayed = await this.prisma.generationJob.updateMany({
          where: { id: jobId, status: "running" },
          data: {
            providerJobId: err.taskId,
            progress: Math.max(dbJob.progress, 95),
            errorMessage: null,
            finishedAt: null,
          },
        });
        if (delayed.count === 0) {
          const current = await this.prisma.generationJob.findUnique({
            where: { id: jobId },
            select: { status: true },
          });
          return { skipped: true, status: current?.status ?? dbJob.status };
        }
        await job.moveToDelayed(Date.now() + TEXT2IMAGE_REPOLL_DELAY_MS, job.token);
        throw new DelayedError();
      }
      if (err instanceof Text2ImageTaskStillRunningError) {
        this.logger.warn(
          `Text2Image job ${jobId} exceeded max poll wall clock; failing local job to release user concurrency`,
        );
      }
      this.logger.error(
        `Text2Image worker failed for job=${jobId} user=${dbJob.userId} model=${dbJob.modelCode}: ${generationErrorLogMessage(err)}`,
        generationErrorLogStack(err),
      );
      this.logger.error(
        `Text2Image worker failure diagnostic: ${providerFailureDiagnostic({
          jobId,
          userId: dbJob.userId,
          modelCode: dbJob.modelCode,
          invocation: activeInvocation
            ? {
                ...activeInvocation,
                params: activeProviderParams,
              }
            : undefined,
        })}`,
      );
      const failed = await this.prisma.generationJob.updateMany({
        where: { id: jobId, status: "running" },
        data: {
          status: "failed",
          progress: 100,
          errorMessage: loggedPublicGenerationErrorMessage(
            err,
            this.logger,
            `Text2Image worker failed for job=${jobId} user=${dbJob.userId} model=${dbJob.modelCode}`,
          ),
          finishedAt: new Date(),
        },
      });
      if (failed.count > 0) {
        await this.refundGenerationJobOnce(
          dbJob.userId,
          dbJob.costCredits,
          `Refund failed job ${dbJob.id}`,
          dbJob.id,
        );
      }
      throw err;
    }
  }

  private hasExceededPollWallClock(
    dbJob: {
      createdAt: Date;
      updatedAt: Date;
      startedAt: Date | null;
    },
    params: Record<string, unknown>,
  ) {
    const activityStart = dbJob.startedAt ?? dbJob.updatedAt ?? dbJob.createdAt;
    return Date.now() - activityStart.getTime() >= maxPollDurationMs(params);
  }

  private async text2ImageInvocationForJob(dbJob: {
    type: string;
    modelCode: string;
    prompt: string;
    params: unknown;
    providerIdSnapshot: string | null;
    providerBaseUrlSnapshot: string | null;
    providerApiStyleSnapshot: unknown;
    providerStatusUrlSnapshot: string | null;
    providerModelNameSnapshot: string | null;
    providerParamsSnapshot: unknown;
  }) {
    if (
      dbJob.providerBaseUrlSnapshot &&
      dbJob.providerModelNameSnapshot &&
      dbJob.providerApiStyleSnapshot
    ) {
      const fallback = await this.fallbackText2ImageInvocation(dbJob);
      const provider =
        dbJob.providerIdSnapshot
          ? await this.providers.resolve(dbJob.providerIdSnapshot)
          : null;
      const params: Record<string, unknown> = Object.keys(
        asRecord(dbJob.providerParamsSnapshot),
      ).length
        ? asRecord(dbJob.providerParamsSnapshot)
        : fallback.params;
      const snapshot = {
        providerId: dbJob.providerIdSnapshot ?? null,
        baseUrl: dbJob.providerBaseUrlSnapshot,
        apiStyle: normalizeApiStyle(dbJob.providerApiStyleSnapshot),
        statusUrl: dbJob.providerStatusUrlSnapshot ?? null,
        modelName: dbJob.providerModelNameSnapshot,
        maxPollDurationMs: pollNumberParam(
          params.maxPollDurationMs,
          fallback.maxPollDurationMs,
          60_000,
          24 * 60 * 60_000,
        ),
        pollIntervalMs: pollNumberParam(
          params.pollIntervalMs,
          fallback.pollIntervalMs,
          500,
          60_000,
        ),
        maxPollAttempts: pollNumberParam(
          params.pollAttempts ?? params.maxPollAttempts,
          fallback.maxPollAttempts,
          1,
          10_000,
        ),
      };
      return {
        ...snapshot,
        apiKey: provider?.apiKey ?? fallback.apiKey,
        params: applyProviderPollConfig(params, snapshot),
      };
    }
    return this.fallbackText2ImageInvocation(dbJob);
  }

  private async fallbackText2ImageInvocation(dbJob: {
    type: string;
    modelCode: string;
    params: unknown;
  }) {
    if (dbJob.type === "IMAGE_EDIT") {
      const mode = await this.imageEditModes.resolve(dbJob.modelCode);
      const params = applyProviderPollConfig(
        {
          ...mode.provider.extra,
          ...mode.defaultParams,
          ...asRecord(dbJob.params),
        },
        mode.provider,
      );
      return {
        providerId: mode.provider.id,
        baseUrl: mode.provider.baseUrl,
        apiStyle: mode.provider.apiStyle,
        statusUrl: mode.provider.statusUrl,
        modelName: mode.modelName,
        params,
        apiKey: mode.provider.apiKey,
        maxPollDurationMs: mode.provider.maxPollDurationMs,
        pollIntervalMs: mode.provider.pollIntervalMs,
        maxPollAttempts: mode.provider.maxPollAttempts,
      };
    }

    const decoded = await this.models.getDecryptedKey(dbJob.modelCode);
    const params = applyProviderPollConfig(
      {
        ...decoded.defaultParams,
        ...asRecord(dbJob.params),
      },
      decoded,
    );
    return {
      providerId: decoded.providerId,
      baseUrl: decoded.baseUrl,
      apiStyle: decoded.apiStyle,
      statusUrl: decoded.statusUrl,
      modelName: decoded.modelName,
      params,
      apiKey: decoded.apiKey,
      maxPollDurationMs: decoded.maxPollDurationMs,
      pollIntervalMs: decoded.pollIntervalMs,
      maxPollAttempts: decoded.maxPollAttempts,
    };
  }

  private async claimRunningSlot(input: {
    id: string;
    userId: string;
    progress: number;
    startedAt: Date | null;
    existingProviderJobId?: string;
  }): Promise<"claimed" | "limited" | "skipped"> {
    if (input.existingProviderJobId) {
      const claimed = await this.prisma.generationJob.updateMany({
        where: { id: input.id, status: "running" },
        data: {
          status: "running",
          progress: Math.max(input.progress, 20),
          startedAt: input.startedAt ?? new Date(),
          errorMessage: null,
        },
      });
      return claimed.count > 0 ? "claimed" : "skipped";
    }

    return this.prisma.$transaction(
      async (tx) => {
        const lockName = `generation:text2image:user:${input.userId}`;
        const lockRows = await tx.$queryRaw<
          Array<{ acquired: number | bigint | null }>
        >`SELECT GET_LOCK(${lockName}, 5) AS acquired`;
        if (Number(lockRows[0]?.acquired ?? 0) !== 1) return "limited";

        try {
          const runningForUser = await tx.generationJob.count({
            where: {
              userId: input.userId,
              status: "running",
              type: { in: ["TEXT2IMAGE", "IMAGE_EDIT"] },
              updatedAt: {
                gte: new Date(Date.now() - TEXT2IMAGE_STALE_RUNNING_MS),
              },
            },
          });
          if (runningForUser >= TEXT2IMAGE_USER_RUNNING_LIMIT) {
            return "limited";
          }

          const claimed = await tx.generationJob.updateMany({
            where: { id: input.id, status: "queued" },
            data: {
              status: "running",
              progress: 10,
              startedAt: input.startedAt ?? new Date(),
              errorMessage: null,
            },
          });
          return claimed.count > 0 ? "claimed" : "skipped";
        } finally {
          try {
            await tx.$queryRaw`SELECT RELEASE_LOCK(${lockName})`;
          } catch (err) {
            this.logger.warn(
              `Failed to release text2image user concurrency lock for user=${input.userId}: ${(err as Error).message}`,
            );
          }
        }
      },
      { timeout: 15_000 },
    );
  }

  private async refundGenerationJobOnce(
    userId: string,
    amount: number,
    reason: string,
    jobId: string,
  ) {
    if (amount <= 0) return;
    const existing = await this.prisma.creditLedger.findFirst({
      where: {
        userId,
        refType: "GENERATION_JOB",
        refId: jobId,
        delta: { gt: 0 },
        reason: { startsWith: "REFUND:" },
      },
      select: { id: true },
    });
    if (existing) return;
    await this.credits.refund(userId, amount, reason, "GENERATION_JOB", jobId);
  }

  private async updateRunningProgress(jobId: string, progress: number) {
    const nextProgress = Math.min(95, Math.max(10, Math.round(progress)));
    await this.prisma.generationJob.updateMany({
      where: {
        id: jobId,
        status: "running",
        progress: { lt: nextProgress },
      },
      data: { progress: nextProgress },
    });
  }

  private async imageEditReferenceBuffer(value: string) {
    const inline = dataUrlToBuffer(value);
    if (inline) return inline.buffer;

    const key = this.oss.assetKeyFromUrl(value);
    const url = key ? (await this.oss.signGet(key, 24 * 3600)) ?? value : value;
    if (!/^https?:\/\//i.test(url)) {
      throw new Error("IMAGE_EDIT_BASE64_SOURCE_REQUIRED");
    }

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error("IMAGE_EDIT_SOURCE_DOWNLOAD_FAILED");
    }
    return Buffer.from(await res.arrayBuffer());
  }

  private async resolveReferenceImages(
    userId: string,
    jobId: string,
    params: Record<string, unknown>,
    type: string,
  ) {
    if (
      type === "IMAGE_EDIT" &&
      isBflImageEditParams(params) &&
      typeof params.image === "string" &&
      typeof params.mask === "string"
    ) {
      const imageInput = await this.imageEditReferenceBuffer(params.image);
      const maskInput = await this.imageEditReferenceBuffer(params.mask);
      const prepared = await prepareBflImageEditPair({
        image: imageInput,
        mask: maskInput,
        params,
      });
      const image = prepared.image.toString("base64");
      const mask = prepared.mask?.toString("base64");
      if (!mask) throw new Error("IMAGE_EDIT_MASK_REQUIRED");
      this.logger.debug(
        `Resolved BFL image edit inputs for job ${jobId}: resized=${prepared.resized} normalizedMask=${prepared.normalizedMask} imageBytes=${prepared.image.length} maskBytes=${prepared.mask?.length ?? 0} imageSize=${formatImageSize(prepared.imageSize)} maskSize=${formatImageSize(prepared.maskSize)} outputImageSize=${formatImageSize(prepared.outputImageSize)} outputMaskSize=${formatImageSize(prepared.outputMaskSize)}`,
      );
      return {
        ...params,
        input_image: undefined,
        inputImage: undefined,
        image,
        image_url: undefined,
        imageUrl: undefined,
        mask,
        mask_url: undefined,
        maskUrl: undefined,
        reference_images: undefined,
        referenceImages: undefined,
        reference_image: undefined,
        referenceImage: undefined,
      };
    }

    const references = type === "IMAGE_EDIT" ? imageEditReferences(params) : text2ImageReferences(params);
    if (!references.length) return params;

    const resolved: string[] = [];
    const referenceMediaIds =
      type === "TEXT2IMAGE" ? text2ImageReferenceMediaIds(params) : [];
    if (
      type === "TEXT2IMAGE" &&
      hasText2ImageReferenceMediaIds(params) &&
      referenceMediaIds.length !== references.length
    ) {
      throw new BadRequestException("REFERENCE_MEDIA_IDS_MUST_ALIGN_WITH_REFERENCE_IMAGES");
    }
    if (
      type === "TEXT2IMAGE" &&
      !referenceMediaIds.some(Boolean) &&
      params.preserveReferenceImageUrls === true
    ) {
      return params;
    }
    for (const [index, item] of references.entries()) {
      const mediaId = referenceMediaIds[index]?.trim();
      if (type === "TEXT2IMAGE" && mediaId) {
        resolved.push(await this.outputMedia.publicObjectUrlForMediaId(mediaId, userId));
        continue;
      }

      const dataUrl = dataUrlToBuffer(item);
      if (dataUrl) {
        const { key } = await this.oss.putBuffer(
          `generations/${userId}/${jobId}/inputs`,
          dataUrl.buffer,
          dataUrl.contentType,
          { userId, visibility: "PRIVATE" },
        );
        resolved.push((await this.oss.signGet(key, 24 * 3600)) ?? item);
        continue;
      }

      const key = this.oss.assetKeyFromUrl(item);
      const signed = key ? await this.oss.signGet(key, 24 * 3600) : null;
      resolved.push(signed ?? item);
    }

    return {
      ...params,
      reference_images: resolved,
      referenceImages: undefined,
      reference_media_ids: undefined,
      referenceMediaIds: undefined,
      reference_image: undefined,
      referenceImage: undefined,
    };
  }
}
