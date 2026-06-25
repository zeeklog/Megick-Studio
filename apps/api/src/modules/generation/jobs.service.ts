import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "nestjs-prisma";
import { InjectQueue } from "@nestjs/bullmq";
import type { FinishedStatus, Job, Queue } from "bullmq";
import { CreditsService } from "../credits/credits.service";
import { AdvancedAccessService } from "@/common/services/advanced-access.service";
import { OssService } from "../oss/oss.service";
import { AiModelsService } from "../ai-models/ai-models.service";
import { AiImageEditModesService } from "../ai-image-edit-modes/ai-image-edit-modes.service";
import {
  ModelProvidersService,
  type ModelProviderApiStyle,
  type ResolvedModelProvider,
} from "../model-providers/model-providers.service";
import { SiteSettingsService } from "../site-settings/site-settings.service";
import { GENERATION_QUEUE } from "./generation.constants";
import {
  GenerationProviderClient,
  Text2ImageTaskStillRunningError,
} from "./generation-provider.client";
import { GenerationOutputMediaService } from "../generation-output-media/generation-output-media.service";
import {
  providerUrlForItem,
  type GeneratedItem,
} from "./generation-provider.types";
import {
  generationErrorLogMessage,
  generationErrorLogStack,
  loggedPublicGenerationErrorMessage,
  publicGenerationErrorMessage,
} from "./generation-errors";
import {
  buildPublicGenerationOutputItems,
  publicProviderOutputUrls,
} from "./generation-output-urls";
import {
  formatImageSize,
  isBflImageEditParams,
  prepareBflImageEditPair,
} from "./bfl-image-edit";
import type {
  AIModel,
  GenerationJob,
  GenerationJobStatusEnum,
  GenerationJobTypeEnum,
  OssAsset,
  Prisma,
} from "@prisma/client";

export interface CreateJobInput {
  type: GenerationJobTypeEnum;
  modelCode: string;
  prompt: string;
  params?: Record<string, unknown>;
  inputAssetKey?: string;
  chatSessionId?: string;
}

export interface ListJobsInput {
  limit?: number;
  offset?: number;
  prompt?: string;
  status?: string;
  type?: string;
}

export interface CreateImageEditJobInput {
  modeCode: string;
  prompt?: string;
  sourceImage: string;
  maskImage?: string;
  params?: Record<string, unknown>;
  chatSessionId?: string;
}

const generationJobStatuses = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
] as const;

const ACTIVE_JOB_STATUSES = new Set<GenerationJobStatusEnum>([
  "queued",
  "running",
]);

const ACTIVE_JOB_STALE_MS = 30 * 60 * 1000;
const TEXT2IMAGE_RECOVERY_DELAY_MS = 30 * 1000;
const DEFAULT_TEXT2IMAGE_MAX_POLL_DURATION_MS = 15 * 60 * 1000;
const DEFAULT_VIDEO_COSTING_SECONDS = 5;
const MIN_VIDEO_COSTING_SECONDS = 1;
const MAX_VIDEO_COSTING_SECONDS = 60;
const VOLCENGINE_SEEDANCE_MIN_SECONDS = 4;
const VOLCENGINE_SEEDANCE_15_PRO_MAX_SECONDS = 12;
const VOLCENGINE_SEEDANCE_20_MAX_SECONDS = 15;
const VOLCENGINE_VIDEO_LIST_STATUSES = new Set([
  "queued",
  "running",
  "cancelled",
  "succeeded",
  "failed",
  "expired",
]);
const UPSTREAM_ACTIVE_STATUSES = new Set([
  "queued",
  "pending",
  "dispatched",
  "running",
  "processing",
  "in_progress",
]);
const VOLCENGINE_VIDEO_DELETABLE_STATUSES = new Set([
  "queued",
  "succeeded",
  "failed",
  "expired",
]);
const UPSTREAM_SUCCESS_STATUSES = new Set([
  "succeeded",
  "success",
  "completed",
  "complete",
  "finished",
  "done",
]);
const UPSTREAM_FAILURE_STATUSES = new Set([
  "failed",
  "failure",
  "error",
  "errored",
  "cancelled",
  "canceled",
  "rejected",
]);

function isGenerationJobStatus(
  status: string,
): status is (typeof generationJobStatuses)[number] {
  return generationJobStatuses.includes(
    status as (typeof generationJobStatuses)[number],
  );
}

function normalizeProviderStatus(status: string | undefined | null) {
  return status?.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isActiveGenerationJobStatus(status: GenerationJobStatusEnum) {
  return ACTIVE_JOB_STATUSES.has(status);
}

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

function mediaUrls(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return "";
      const url = (item as { url?: unknown; src?: unknown }).url ?? (item as { src?: unknown }).src;
      return typeof url === "string" ? url : "";
    })
    .filter(Boolean);
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

function videoReferenceInputs(
  params: Record<string, unknown>,
  inputAssetKey?: string,
) {
  return [
    ...mediaUrls(params.media),
    ...stringArray(params.imageUrls),
    ...stringArray(params.videoUrls),
    ...stringArray(params.images),
    ...stringArray(params.videos),
    ...stringArray(params.reference_images),
    ...stringArray(params.referenceImages),
    ...stringArray(params.reference_videos),
    ...stringArray(params.referenceVideos),
    ...(typeof params.image === "string" ? [params.image] : []),
    ...(typeof params.imageUrl === "string" ? [params.imageUrl] : []),
    ...(typeof params.video === "string" ? [params.video] : []),
    ...(typeof params.videoUrl === "string" ? [params.videoUrl] : []),
    ...(typeof params.input_reference === "string"
      ? [params.input_reference]
      : []),
    ...(typeof params.referenceImage === "string"
      ? [params.referenceImage]
      : []),
    ...(typeof params.reference_image === "string"
      ? [params.reference_image]
      : []),
    ...(typeof params.referenceImageUrl === "string"
      ? [params.referenceImageUrl]
      : []),
    ...(typeof params.referenceVideo === "string"
      ? [params.referenceVideo]
      : []),
    ...(typeof params.reference_video === "string"
      ? [params.reference_video]
      : []),
    ...(typeof params.referenceVideoUrl === "string"
      ? [params.referenceVideoUrl]
      : []),
    ...(inputAssetKey ? [inputAssetKey] : []),
  ].filter((item) => item.trim().length > 0);
}

function uniqueReferencesByKey(
  references: string[],
  keyForReference: (value: string) => string | null,
) {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = keyForReference(reference) ?? reference.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function orderedAssets(assetIds: string[], assets: OssAsset[]) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  return assetIds
    .map((id) => byId.get(id))
    .filter((asset): asset is OssAsset => Boolean(asset));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

type ProviderInvocationSnapshot = {
  providerId: string | null;
  baseUrl: string;
  apiStyle: ModelProviderApiStyle;
  statusUrl: string | null;
  modelName: string;
  params: Record<string, unknown>;
  maxPollDurationMs: number;
  pollIntervalMs: number;
  maxPollAttempts: number;
};

type Text2ImageInvocation = ProviderInvocationSnapshot & {
  apiKey: string;
};

type VideoInvocation = ProviderInvocationSnapshot & {
  apiKey: string;
};

function providerSnapshotData(snapshot: ProviderInvocationSnapshot) {
  return {
    providerIdSnapshot: snapshot.providerId,
    providerBaseUrlSnapshot: snapshot.baseUrl,
    providerApiStyleSnapshot: snapshot.apiStyle,
    providerStatusUrlSnapshot: snapshot.statusUrl,
    providerModelNameSnapshot: snapshot.modelName,
    providerParamsSnapshot: snapshot.params as Prisma.InputJsonValue,
  };
}

function applyProviderPollConfig(
  params: Record<string, unknown>,
  input: Pick<
    ProviderInvocationSnapshot,
    "apiStyle" | "statusUrl" | "maxPollDurationMs" | "pollIntervalMs" | "maxPollAttempts"
  >,
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

function providerSnapshotFromDecoded(
  decoded: Awaited<ReturnType<AiModelsService["getDecryptedKey"]>>,
  params: Record<string, unknown>,
): ProviderInvocationSnapshot {
  return {
    providerId: decoded.providerId,
    baseUrl: decoded.baseUrl,
    apiStyle: decoded.apiStyle,
    statusUrl: decoded.statusUrl,
    modelName: decoded.modelName,
    params: applyProviderPollConfig(
      {
        ...decoded.defaultParams,
        ...params,
      },
      decoded,
    ),
    maxPollDurationMs: decoded.maxPollDurationMs,
    pollIntervalMs: decoded.pollIntervalMs,
    maxPollAttempts: decoded.maxPollAttempts,
  };
}

function providerSnapshotFromImageEditMode(input: {
  provider: ResolvedModelProvider;
  modelName: string;
  params: Record<string, unknown>;
}): ProviderInvocationSnapshot {
  return {
    providerId: input.provider.id,
    baseUrl: input.provider.baseUrl,
    apiStyle: input.provider.apiStyle,
    statusUrl: input.provider.statusUrl,
    modelName: input.modelName,
    params: applyProviderPollConfig(input.params, input.provider),
    maxPollDurationMs: input.provider.maxPollDurationMs,
    pollIntervalMs: input.provider.pollIntervalMs,
    maxPollAttempts: input.provider.maxPollAttempts,
  };
}

function videoDurationParam(params: Record<string, unknown>) {
  return params.duration ?? params.seconds;
}

function isVolcengineSeedance20Model(modelName: string) {
  return /^doubao-seedance-2-0(?:-|$)/i.test(modelName.trim());
}

function isVolcengineSeedance15ProModel(modelName: string) {
  return /^doubao-seedance-1-5-pro(?:-|$)/i.test(modelName.trim());
}

function isVolcengineSeedanceModel(modelName: string) {
  return (
    isVolcengineSeedance20Model(modelName) ||
    isVolcengineSeedance15ProModel(modelName)
  );
}

function isVolcengineVideoInvocation(input: {
  apiStyle: ModelProviderApiStyle;
  baseUrl: string;
  params: Record<string, unknown>;
}) {
  const configured = stringParam(input.params.apiStyle ?? input.params.provider);
  const marker = `${input.baseUrl} ${configured ?? ""}`.toLowerCase();
  return (
    input.apiStyle === "VOLCENGINE" ||
    configured === "volcengine-video" ||
    configured?.toUpperCase() === "VOLCENGINE" ||
    marker.includes("volces.com") ||
    marker.includes("volcengine.com") ||
    marker.includes("ark.cn-beijing")
  );
}

function normalizeVideoDurationSeconds(
  value: unknown,
  options: {
    min?: number;
    max?: number;
    rejectSmartDuration?: boolean;
  } = {},
) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  if (!Number.isFinite(numeric)) {
    throw new BadRequestException("INVALID_VIDEO_DURATION");
  }
  if (numeric === -1 && options.rejectSmartDuration) {
    throw new BadRequestException("VIDEO_DURATION_SMART_NOT_ALLOWED");
  }
  const seconds = Math.ceil(numeric);
  const min = options.min ?? MIN_VIDEO_COSTING_SECONDS;
  const max = options.max ?? MAX_VIDEO_COSTING_SECONDS;
  if (seconds < min) {
    throw new BadRequestException("INVALID_VIDEO_DURATION");
  }
  if (seconds > max) {
    throw new BadRequestException("VIDEO_DURATION_TOO_LONG");
  }
  return seconds;
}

function assertVolcengineSeedanceParams(
  modelName: string,
  params: Record<string, unknown>,
) {
  if (!isVolcengineSeedanceModel(modelName)) {
    throw new BadRequestException("UNSUPPORTED_VOLCENGINE_VIDEO_MODEL");
  }
  if (params.frames !== undefined) {
    throw new BadRequestException("VIDEO_FRAMES_NOT_SUPPORTED");
  }
  const resolution = stringParam(params.resolution ?? params.size)?.toLowerCase();
  if (
    resolution &&
    !["480p", "720p", "1080p"].includes(resolution)
  ) {
    throw new BadRequestException("INVALID_VIDEO_RESOLUTION");
  }
  if (resolution === "1080p" && /fast/i.test(modelName)) {
    throw new BadRequestException("VIDEO_RESOLUTION_NOT_SUPPORTED");
  }
  const ratio = stringParam(params.ratio ?? params.aspectRatio ?? params.aspect_ratio);
  if (
    ratio &&
    !["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"].includes(ratio)
  ) {
    throw new BadRequestException("INVALID_VIDEO_RATIO");
  }
  if (
    isVolcengineSeedance20Model(modelName) &&
    (params.service_tier !== undefined || params.serviceTier !== undefined)
  ) {
    throw new BadRequestException("VIDEO_SERVICE_TIER_NOT_SUPPORTED");
  }
  if (
    isVolcengineSeedance20Model(modelName) &&
    (params.camera_fixed !== undefined || params.cameraFixed !== undefined)
  ) {
    throw new BadRequestException("VIDEO_CAMERA_FIXED_NOT_SUPPORTED");
  }
  if (isVolcengineSeedance20Model(modelName) && params.draft !== undefined) {
    throw new BadRequestException("VIDEO_DRAFT_NOT_SUPPORTED");
  }
  if (
    isVolcengineSeedance15ProModel(modelName) &&
    (params.priority !== undefined || params.tools !== undefined)
  ) {
    throw new BadRequestException("VIDEO_PARAM_NOT_SUPPORTED");
  }
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: CreditsService,
    private readonly advancedAccess: AdvancedAccessService,
    private readonly oss: OssService,
    private readonly models: AiModelsService,
    private readonly imageEditModes: AiImageEditModesService,
    private readonly providers: ModelProvidersService,
    private readonly settings: SiteSettingsService,
    private readonly provider: GenerationProviderClient,
    private readonly outputMedia: GenerationOutputMediaService,
    @InjectQueue(GENERATION_QUEUE) private readonly queue: Queue,
  ) {}

  async createJob(userId: string, input: CreateJobInput) {
    if (input.type === "IMAGE_EDIT") {
      throw new BadRequestException("Use /api/generation/jobs/image-edit");
    }
    await this.assertGenerationTypeEnabled(input.type);
    const params = input.params ?? {};
    const model = await this.models.byCode(input.modelCode);
    if (!model.isActive) throw new BadRequestException("MODEL_INACTIVE");
    if (model.category !== (input.type === "IMAGE2VIDEO" ? "IMAGE2VIDEO" : "TEXT2IMAGE")) {
      throw new BadRequestException("MODEL_TYPE_MISMATCH");
    }
    await this.assertModelAccess(userId, model.accessLevel);
    const decoded = await this.models.getDecryptedKey(model.code);
    const costing = this.resolveJobCosting(model, params, decoded);
    this.assertImageReferenceRequirements(model, costing.params);
    this.assertVideoReferenceRequirements(
      model,
      costing.params,
      input.inputAssetKey,
    );
    const providerSnapshot = providerSnapshotFromDecoded(decoded, costing.params);
    await this.credits.spend(
      userId,
      costing.costCredits,
      this.creditSpendReason(model, costing.durationSeconds),
      "GENERATION_JOB",
    );

    const job = await this.prisma.generationJob.create({
      data: {
        userId,
        modelId: model.id,
        modelCode: model.code,
        type: input.type,
        status: "queued",
        progress: 0,
        prompt: input.prompt,
        params: costing.params as Prisma.InputJsonValue,
        inputAssetKey: input.inputAssetKey,
        outputAssetIds: [] as Prisma.InputJsonValue,
        providerOutputUrls: [] as Prisma.InputJsonValue,
        costCredits: costing.costCredits,
        ...(providerSnapshot ? providerSnapshotData(providerSnapshot) : {}),
        chatSessionId: input.chatSessionId,
      },
      include: { model: { select: { displayName: true } } },
    });

    await this.queue.add(
      input.type,
      { jobId: job.id },
      {
        jobId: job.id,
        attempts: 1,
      },
    );

    return this.toPublicJob(job);
  }

  async createSync(userId: string, input: CreateJobInput) {
    if (input.type === "IMAGE_EDIT") {
      throw new BadRequestException("Use /api/generation/jobs/image-edit");
    }
    await this.assertGenerationTypeEnabled(input.type);
    const model = await this.models.byCode(input.modelCode);
    if (!model.isActive) throw new BadRequestException("MODEL_INACTIVE");
    if (model.category !== (input.type === "IMAGE2VIDEO" ? "IMAGE2VIDEO" : "TEXT2IMAGE")) {
      throw new BadRequestException("MODEL_TYPE_MISMATCH");
    }
    await this.assertModelAccess(userId, model.accessLevel);
    if (input.type !== "TEXT2IMAGE") {
      throw new BadRequestException(
        "Sync execution only supported for TEXT2IMAGE for now",
      );
    }
    const decoded = await this.models.getDecryptedKey(model.code);
    const costing = this.resolveJobCosting(model, input.params ?? {}, decoded);
    this.assertImageReferenceRequirements(model, costing.params);
    const providerSnapshot = providerSnapshotFromDecoded(decoded, costing.params);
    await this.credits.spend(
      userId,
      costing.costCredits,
      `Generation (sync): ${model.code}`,
      "GENERATION_JOB",
    );

    const job = await this.prisma.generationJob.create({
      data: {
        userId,
        modelId: model.id,
        modelCode: model.code,
        type: input.type,
        status: "running",
        progress: 10,
        prompt: input.prompt,
        params: costing.params as Prisma.InputJsonValue,
        outputAssetIds: [] as Prisma.InputJsonValue,
        providerOutputUrls: [] as Prisma.InputJsonValue,
        costCredits: costing.costCredits,
        startedAt: new Date(),
        ...providerSnapshotData(providerSnapshot),
        chatSessionId: input.chatSessionId,
      },
    });

    try {
      const result = await this.runText2Image(job, input);
      const outputs: { url: string; key: string; asset: OssAsset }[] = [];
      const assetIds: string[] = [];
      const providerOutputUrls: string[] = [];
      const providerJobId = result
        .map((item) => item.providerJobId)
        .find((value): value is string => Boolean(value));
      const rememberProviderUrl = (url: string | undefined | null) => {
        if (url && !providerOutputUrls.includes(url))
          providerOutputUrls.push(url);
      };

      for (const r of result) {
        const directProviderUrl = providerUrlForItem(r);
        rememberProviderUrl(directProviderUrl);

        let materialized: {
          bytes?: Buffer;
          contentType?: string;
          url?: string;
        } | null = null;
        try {
          materialized = await this.provider.materialize(
            r,
            r.contentType ?? "image/png",
          );
        } catch (downloadErr) {
          this.logger.warn(
            `Generated image download failed for sync job ${job.id}: ${(downloadErr as Error).message}`,
          );
          throw downloadErr;
        }
        const providerUrl = materialized.url ?? directProviderUrl ?? null;
        rememberProviderUrl(providerUrl);
        if (!materialized.bytes) {
          throw new Error(
            "Provider output could not be materialized for OSS persistence",
          );
        }
        try {
          const { key, asset } = await this.oss.putBuffer(
            `generations/${userId}/${job.id}`,
            materialized.bytes,
            materialized.contentType ?? r.contentType ?? "image/png",
            { userId, visibility: "PRIVATE", requireUpload: true },
          );
          const url = await this.oss.signGet(key, 24 * 3600);
          if (!url) throw new Error("Generated asset could not be signed");
          const outputIndex = outputs.length;
          outputs.push({ key, url, asset });
          assetIds.push(asset.id);
          await this.outputMedia.ensureForAsset({
            userId,
            jobId: job.id,
            outputIndex,
            assetId: asset.id,
          });
        } catch (uploadErr) {
          this.logger.error(
            `OSS upload failed for sync job ${job.id}: ${(uploadErr as Error).message}`,
          );
          throw uploadErr;
        }
      }

      if (!outputs.length) {
        throw new Error("Provider returned no image outputs");
      }

      await this.prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: "succeeded",
          progress: 100,
          outputAssetIds: assetIds as Prisma.InputJsonValue,
          providerOutputUrls: providerOutputUrls as Prisma.InputJsonValue,
          providerJobId,
          errorMessage: null,
          finishedAt: new Date(),
        },
      });

      const hasAdvancedAccess = await this.advancedAccess.hasAdvancedAccess(userId);
      return {
        jobId: job.id,
        outputs: await Promise.all(
          outputs.map(async (output, index) => {
            const ref = await this.outputMedia.publicRefForAsset({
              userId,
              jobId: job.id,
              outputIndex: index,
              type: job.type,
              asset: output.asset,
              assetUrl: output.url,
              hasAdvancedAccess,
            });
            return {
              key: hasAdvancedAccess ? output.key : "",
              mediaId: ref.mediaId,
              url: ref.url ?? output.url,
            };
          }),
        ),
      };
    } catch (err) {
      this.logger.error(
        `Sync generation job ${job.id} failed for user=${userId} model=${model.code}: ${generationErrorLogMessage(err)}`,
        generationErrorLogStack(err),
      );
      await this.prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          progress: 100,
          errorMessage: loggedPublicGenerationErrorMessage(
            err,
            this.logger,
            `Sync generation job ${job.id} failed for user=${userId} model=${model.code}`,
          ),
          finishedAt: new Date(),
        },
      });
      await this.credits.refund(
        userId,
        costing.costCredits,
        `Refund failed job ${job.id}`,
        "GENERATION_JOB",
        job.id,
      );
      throw new ServiceUnavailableException(
        loggedPublicGenerationErrorMessage(
          err,
          this.logger,
          `Sync generation response for job ${job.id} user=${userId} model=${model.code}`,
        ),
      );
    }
  }

  async createImageEditJob(userId: string, input: CreateImageEditJobInput) {
    const mode = await this.imageEditModes.resolve(input.modeCode);
    const trimmedPrompt = input.prompt?.trim() ?? "";
    const promptRequired = mode.defaultParams.promptRequired === true;
    const defaultPrompt =
      typeof mode.defaultParams.defaultPrompt === "string"
        ? mode.defaultParams.defaultPrompt.trim()
        : "";
    if (mode.requiresMask && !input.maskImage?.trim()) {
      throw new BadRequestException("IMAGE_EDIT_MASK_REQUIRED");
    }
    if (promptRequired && !trimmedPrompt) {
      throw new BadRequestException("IMAGE_EDIT_PROMPT_REQUIRED");
    }
    const prompt = trimmedPrompt || defaultPrompt;
    const requiredCredits = Math.max(0, mode.costCredits);
    await this.credits.spend(
      userId,
      requiredCredits,
      `Image edit: ${mode.code}`,
      "GENERATION_JOB",
    );

    const fallbackModel = await this.ensureImageEditBackingModel(mode);
    const params = {
      ...mode.provider.extra,
      ...mode.defaultParams,
      ...(input.params ?? {}),
      modeCode: mode.code,
      modeName: mode.name,
      requiresMask: mode.requiresMask,
      input_image: input.sourceImage,
      image: input.sourceImage,
      reference_images: [input.sourceImage],
      ...(input.maskImage
        ? {
            mask: input.maskImage,
            mask_url: input.maskImage,
          }
        : {}),
    };
    const providerSnapshot = providerSnapshotFromImageEditMode({
      provider: mode.provider,
      modelName: mode.modelName,
      params,
    });

    const job = await this.prisma.generationJob.create({
      data: {
        userId,
        modelId: fallbackModel.id,
        modelCode: mode.code,
        type: "IMAGE_EDIT",
        status: "queued",
        progress: 0,
        prompt,
        params: params as Prisma.InputJsonValue,
        inputAssetKey: this.oss.assetKeyFromUrl(input.sourceImage) ?? undefined,
        outputAssetIds: [] as Prisma.InputJsonValue,
        providerOutputUrls: [] as Prisma.InputJsonValue,
        costCredits: requiredCredits,
        ...providerSnapshotData(providerSnapshot),
        chatSessionId: input.chatSessionId,
      },
      include: { model: { select: { displayName: true } } },
    });

    await this.queue.add(
      "TEXT2IMAGE",
      { jobId: job.id },
      {
        jobId: job.id,
        attempts: 1,
      },
    );

    return { jobId: job.id, job: await this.toPublicJob(job) };
  }

  private async text2ImageInvocationForJob(
    job: GenerationJob,
    input?: Pick<CreateJobInput, "modelCode" | "params">,
  ): Promise<Text2ImageInvocation> {
    if (
      job.providerBaseUrlSnapshot &&
      job.providerModelNameSnapshot &&
      job.providerApiStyleSnapshot
    ) {
      const fallback = await this.fallbackText2ImageInvocation(job, input);
      const provider =
        job.providerIdSnapshot
          ? await this.providers.resolve(job.providerIdSnapshot)
          : null;
      const snapshotParams = asRecord(job.providerParamsSnapshot);
      const params = Object.keys(snapshotParams).length
        ? snapshotParams
        : {
            ...fallback.params,
            ...((job.params as Record<string, unknown>) ?? {}),
          };
      const snapshot = {
        providerId: job.providerIdSnapshot ?? null,
        baseUrl: job.providerBaseUrlSnapshot,
        apiStyle: normalizeApiStyle(job.providerApiStyleSnapshot),
        statusUrl: job.providerStatusUrlSnapshot ?? null,
        modelName: job.providerModelNameSnapshot,
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

    return this.fallbackText2ImageInvocation(job, input);
  }

  private async fallbackText2ImageInvocation(
    job: GenerationJob,
    input?: Pick<CreateJobInput, "modelCode" | "params">,
  ): Promise<Text2ImageInvocation> {
    if (job.type === "IMAGE_EDIT") {
      const mode = await this.imageEditModes.resolve(job.modelCode);
      const params = {
        ...mode.provider.extra,
        ...mode.defaultParams,
        ...((job.params as Record<string, unknown>) ?? {}),
        ...(input?.params ?? {}),
      };
      const snapshot = providerSnapshotFromImageEditMode({
        provider: mode.provider,
        modelName: mode.modelName,
        params,
      });
      return {
        ...snapshot,
        apiKey: mode.provider.apiKey,
      };
    }

    const decoded = await this.models.getDecryptedKey(input?.modelCode ?? job.modelCode);
    const params = applyProviderPollConfig(
      {
        ...decoded.defaultParams,
        ...((job.params as Record<string, unknown>) ?? {}),
        ...(input?.params ?? {}),
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

  async videoInvocationForJob(
    job: Pick<
      GenerationJob,
      | "type"
      | "modelCode"
      | "params"
      | "providerIdSnapshot"
      | "providerBaseUrlSnapshot"
      | "providerApiStyleSnapshot"
      | "providerStatusUrlSnapshot"
      | "providerModelNameSnapshot"
      | "providerParamsSnapshot"
    >,
    input?: Pick<CreateJobInput, "modelCode" | "params">,
  ): Promise<VideoInvocation> {
    if (job.type !== "IMAGE2VIDEO") {
      throw new BadRequestException("MODEL_TYPE_MISMATCH");
    }
    if (
      job.providerBaseUrlSnapshot &&
      job.providerModelNameSnapshot &&
      job.providerApiStyleSnapshot
    ) {
      const fallback = await this.fallbackVideoInvocation(job, input);
      const provider =
        job.providerIdSnapshot
          ? await this.providers.resolve(job.providerIdSnapshot)
          : null;
      const snapshotParams = asRecord(job.providerParamsSnapshot);
      const params = Object.keys(snapshotParams).length
        ? snapshotParams
        : {
            ...fallback.params,
            ...asRecord(job.params),
            ...(input?.params ?? {}),
          };
      const snapshot = {
        providerId: job.providerIdSnapshot ?? null,
        baseUrl: job.providerBaseUrlSnapshot,
        apiStyle: normalizeApiStyle(job.providerApiStyleSnapshot),
        statusUrl: job.providerStatusUrlSnapshot ?? null,
        modelName: job.providerModelNameSnapshot,
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

    return this.fallbackVideoInvocation(job, input);
  }

  private async fallbackVideoInvocation(
    job: Pick<GenerationJob, "modelCode" | "params">,
    input?: Pick<CreateJobInput, "modelCode" | "params">,
  ): Promise<VideoInvocation> {
    const decoded = await this.models.getDecryptedKey(input?.modelCode ?? job.modelCode);
    const params = applyProviderPollConfig(
      {
        ...decoded.defaultParams,
        ...asRecord(job.params),
        ...(input?.params ?? {}),
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

  private async assertGenerationTypeEnabled(type: GenerationJobTypeEnum) {
    if (type !== "IMAGE2VIDEO") return;
    if (await this.settings.isVideoGenerationEnabled()) return;
    throw new BadRequestException("VIDEO_GENERATION_DISABLED");
  }

  async runText2Image(
    job: GenerationJob,
    input: CreateJobInput,
  ): Promise<GeneratedItem[]> {
    const invocation = await this.text2ImageInvocationForJob(job, input);
    const providerParams = await this.resolveText2ImageReferenceImages(
      job.userId,
      job.id,
      invocation.params,
    );
    const items = await this.provider.text2image({
      apiKey: invocation.apiKey,
      baseUrl: invocation.baseUrl,
      apiStyle: invocation.apiStyle,
      statusUrl: invocation.statusUrl,
      modelName: invocation.modelName,
      prompt: input.prompt,
      params: providerParams,
      onProviderJobId: async (providerJobId) => {
        await this.prisma.generationJob.updateMany({
          where: { id: job.id, status: "running" },
          data: { providerJobId },
        });
      },
      onProgress: async (progress) => {
        const nextProgress = Math.min(95, Math.max(10, Math.round(progress)));
        await this.prisma.generationJob.updateMany({
          where: {
            id: job.id,
            status: "running",
            progress: { lt: nextProgress },
          },
          data: { progress: nextProgress },
        });
      },
    });
    if (!items.length) {
      throw new Error("Provider returned no image outputs");
    }
    return items;
  }

  async listForUser(userId: string, query: number | ListJobsInput = 20) {
    const input: ListJobsInput =
      typeof query === "number" ? { limit: query } : query;
    const prompt = input.prompt?.trim();
    const rawStatus = input.status?.trim();
    const rawType = input.type?.trim();
    const status =
      rawStatus && isGenerationJobStatus(rawStatus) ? rawStatus : undefined;
    const type =
      rawType === "TEXT2IMAGE" || rawType === "IMAGE2VIDEO" || rawType === "IMAGE_EDIT"
        ? rawType
        : undefined;
    const where: Prisma.GenerationJobWhereInput = {
      userId,
      ...(status ? { status: status as GenerationJobStatusEnum } : {}),
      ...(type ? { type } : {}),
      ...(prompt ? { prompt: { contains: prompt } } : {}),
    };
    const jobs = await this.prisma.generationJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: Math.max(input.offset ?? 0, 0),
      take: Math.min(Math.max(input.limit ?? 20, 1), 100),
      include: { model: { select: { displayName: true } } },
    });
    const settledJobs = await Promise.all(
      jobs.map((job) => this.reconcileStaleActiveJob(job)),
    );
    return Promise.all(settledJobs.map((j) => this.toPublicJob(j)));
  }

  async deleteForUser(userId: string, jobId: string) {
    const job = await this.prisma.generationJob.findFirst({
      where: { id: jobId, userId },
      include: { model: { select: { displayName: true } } },
    });
    if (!job) throw new NotFoundException();
    if (job.type === "IMAGE2VIDEO" && job.providerJobId) {
      return this.deleteVideoJobWithUpstreamCheck(job);
    }
    await this.prisma.generationJob.delete({ where: { id: job.id } });
    return { count: 1 };
  }

  async listUpstreamVideoTasks(query: {
    modelCode?: string;
    pageNum?: number;
    pageSize?: number;
    status?: string;
    taskIds?: string[];
  }) {
    const modelCode = query.modelCode?.trim() || "volc-seedance-2-0-t2v";
    const model = await this.models.byCode(modelCode);
    if (model.category !== "IMAGE2VIDEO") {
      throw new BadRequestException("MODEL_TYPE_MISMATCH");
    }
    const invocation = await this.fallbackVideoInvocation({
      modelCode: model.code,
      params: {},
    } as Pick<GenerationJob, "modelCode" | "params">);
    if (
      !isVolcengineVideoInvocation({
        apiStyle: invocation.apiStyle,
        baseUrl: invocation.baseUrl,
        params: invocation.params,
      })
    ) {
      throw new BadRequestException("VIDEO_TASK_LIST_UNSUPPORTED_PROVIDER");
    }
    const status = query.status?.trim();
    if (status && !VOLCENGINE_VIDEO_LIST_STATUSES.has(status)) {
      throw new BadRequestException("INVALID_VIDEO_TASK_STATUS");
    }
    return this.provider.listVideoTasks(
      {
        apiKey: invocation.apiKey,
        baseUrl: invocation.baseUrl,
        apiStyle: invocation.apiStyle,
        statusUrl: invocation.statusUrl,
        modelName: invocation.modelName,
        prompt: "",
        params: invocation.params,
      },
      {
        pageNum: Math.max(1, Math.round(query.pageNum ?? 1)),
        pageSize: Math.min(Math.max(Math.round(query.pageSize ?? 20), 1), 100),
        status,
        taskIds: query.taskIds,
        model: invocation.modelName,
      },
    );
  }

  async getJob(userId: string, jobId: string) {
    const job = await this.prisma.generationJob.findFirst({
      where: { id: jobId, userId },
      include: { model: { select: { displayName: true } } },
    });
    if (!job) throw new NotFoundException();
    return this.toPublicJobSnapshot(job);
  }

  async toPublicJobSnapshot<
    TJob extends GenerationJob & { model?: { displayName: string } | null },
  >(job: TJob, modelDisplayName?: string) {
    return this.toPublicJob(
      await this.reconcileStaleActiveJob(job),
      modelDisplayName,
    );
  }

  async getOutputContent(
    userId: string,
    jobId: string,
    outputIndex: number,
    input: { variant?: "thumbnail" } = {},
  ) {
    if (!Number.isInteger(outputIndex) || outputIndex < 0) {
      throw new BadRequestException("INVALID_OUTPUT_INDEX");
    }

    const job = await this.prisma.generationJob.findFirst({
      where: { id: jobId, userId },
      select: {
        type: true,
        outputAssetIds: true,
        providerOutputUrls: true,
      },
    });
    if (!job) throw new NotFoundException();

    const assetIds = (job.outputAssetIds as string[] | null) ?? [];
    const providerOutputUrls = stringArray(job.providerOutputUrls);
    const assets = assetIds.length
      ? await this.prisma.ossAsset.findMany({ where: { id: { in: assetIds } } })
      : ([] as OssAsset[]);
    const ordered = orderedAssets(assetIds, assets);
    const count = Math.max(ordered.length, providerOutputUrls.length);
    if (outputIndex >= count) throw new NotFoundException();

    const asset = ordered[outputIndex];
    if (asset) {
      if (job.type === "TEXT2IMAGE" || job.type === "IMAGE_EDIT") {
        return this.outputMedia.getOutputContent(
          await this.outputMedia.ensureForAsset({
            userId,
            jobId,
            outputIndex,
            assetId: asset.id,
          }),
          userId,
          input,
        );
      }
      const content = await this.oss.getAuthorizedAssetContent(asset.key, {
        id: userId,
      });
      return {
        content: content.content,
        contentType: content.contentType,
        sizeBytes: content.sizeBytes,
      };
    }

    const providerUrl = providerOutputUrls[outputIndex] ?? null;
    if (job.type === "TEXT2IMAGE" || job.type === "IMAGE_EDIT") {
      throw new NotFoundException();
    }

    if (!providerUrl) throw new NotFoundException();

    return this.fetchExternalOutputContent(providerUrl, job.type);
  }

  async getProviderOutputContent(
    mediaId: string,
    userId: string,
    input: { variant?: "thumbnail" } = {},
  ) {
    return this.outputMedia.getOutputContent(mediaId, userId, input);
  }

  private async fetchExternalOutputContent(
    url: string,
    type: GenerationJobTypeEnum,
  ) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        throw new BadGatewayException(`UPSTREAM_OUTPUT_FETCH_FAILED:${res.status}`);
      }
      const content = Buffer.from(await res.arrayBuffer());
      if (!content.length) throw new BadGatewayException("EMPTY_OUTPUT");
      return {
        content,
        contentType:
          res.headers.get("content-type") ??
          (type === "IMAGE2VIDEO" ? "video/mp4" : "image/png"),
        sizeBytes: content.length,
      };
    } catch (err) {
      if (err instanceof BadGatewayException) throw err;
      throw new BadGatewayException(
        `UPSTREAM_OUTPUT_FETCH_FAILED:${(err as Error).message}`,
      );
    }
  }

  async listAdmin(query: {
    skip?: number;
    take?: number;
    q?: string;
    modelCode?: string;
    status?: string;
  }) {
    const q = query.q?.trim();
    const modelCode = query.modelCode?.trim();
    const rawStatus = query.status?.trim();
    const status =
      rawStatus && isGenerationJobStatus(rawStatus) ? rawStatus : undefined;
    const where: Prisma.GenerationJobWhereInput = {
      ...(status ? { status } : {}),
      ...(modelCode ? { modelCode } : {}),
      ...(q
        ? {
            OR: [
              { id: { contains: q } },
              { modelCode: { contains: q } },
              { prompt: { contains: q } },
              { providerJobId: { contains: q } },
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

    const include = {
      user: { select: { id: true, email: true } },
    } satisfies Prisma.GenerationJobInclude;

    const [jobs, total] = await this.prisma.$transaction([
      this.prisma.generationJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: query.skip ?? 0,
        take: Math.min(query.take ?? 50, 200),
        include,
      }),
      this.prisma.generationJob.count({ where }),
    ]);

    return { items: jobs, total };
  }

  async reconcileText2ImageJob(
    jobId: string,
    options: { execute?: boolean } = {},
  ) {
    const job = await this.prisma.generationJob.findUnique({
      where: { id: jobId },
      include: { model: { select: { displayName: true } } },
    });
    if (!job) return { jobId, action: "not_found" };
    if (job.type !== "TEXT2IMAGE" && job.type !== "IMAGE_EDIT") {
      return { jobId, action: "skipped", reason: `unsupported type ${job.type}` };
    }
    if (job.status === "succeeded") {
      return { jobId, action: "skipped", reason: "already succeeded" };
    }
    if (!job.providerJobId) {
      return { jobId, action: "skipped", reason: "missing providerJobId" };
    }

    let invocation = await this.text2ImageInvocationForJob(job);
    if (invocation.apiStyle === "OPENAI" && !invocation.statusUrl) {
      const legacyCrexInvocation = await this.legacyCrexInvocationForJob(
        job,
        invocation,
      );
      if (legacyCrexInvocation) {
        invocation = legacyCrexInvocation;
      }
    }

    if (invocation.apiStyle === "OPENAI" && !invocation.statusUrl) {
      const errorMessage =
        "OPENAI style image provider does not support task status polling; no statusUrl is configured.";
      if (!options.execute) {
        return { jobId, action: "would_fail", reason: errorMessage };
      }
      return this.markReconciledJobFailed(job, errorMessage);
    }

    try {
      const result = await this.provider.getText2ImageTaskResult(
        {
          apiKey: invocation.apiKey,
          baseUrl: invocation.baseUrl,
          apiStyle: invocation.apiStyle,
          statusUrl: invocation.statusUrl,
          modelName: invocation.modelName,
          prompt: job.prompt,
          params: invocation.params,
        },
        job.providerJobId,
      );
      if (!result) {
        const errorMessage =
          "No task status URL could be resolved for this provider job.";
        if (!options.execute) {
          return { jobId, action: "would_fail", reason: errorMessage };
        }
        return this.markReconciledJobFailed(job, errorMessage);
      }

      const status = normalizeProviderStatus(result.status);
      if (result.items.length) {
        if (!options.execute) {
          return {
            jobId,
            action: "would_succeed",
            status,
            outputCount: result.items.length,
          };
        }
        const persisted = await this.persistText2ImageItems(job, result.items);
        return {
          jobId,
          action: "succeeded",
          status,
          ...persisted,
        };
      }

      if (status && UPSTREAM_FAILURE_STATUSES.has(status)) {
        const errorMessage =
          result.error ??
          `Image generation task ${job.providerJobId} failed upstream with status ${status}`;
        if (!options.execute) {
          return { jobId, action: "would_fail", status, reason: errorMessage };
        }
        return this.markReconciledJobFailed(job, errorMessage);
      }

      if (status && UPSTREAM_SUCCESS_STATUSES.has(status)) {
        return {
          jobId,
          action: "needs_manual_review",
          status,
          reason: "upstream status is successful but no image output was found",
        };
      }

      return {
        jobId,
        action: "still_running",
        status: status ?? "unknown",
      };
    } catch (err) {
      if (err instanceof Text2ImageTaskStillRunningError) {
        return { jobId, action: "still_running", reason: err.message };
      }
      const errorMessage = generationErrorLogMessage(err);
      const permanent =
        /404|invalid url|no statusurl|not found/i.test(errorMessage);
      if (!options.execute || !permanent) {
        return {
          jobId,
          action: permanent ? "would_fail" : "query_failed",
          reason: errorMessage,
        };
      }
      return this.markReconciledJobFailed(job, errorMessage);
    }
  }

  private async assertModelAccess(userId: string, accessLevel: "FREE" | "PAID") {
    if (accessLevel !== "PAID") return;
    if (await this.advancedAccess.hasAdvancedAccess(userId)) return;
    throw new ForbiddenException("ADVANCED_ACCESS_REQUIRED");
  }

  private resolveJobCosting(
    model: AIModel,
    params: Record<string, unknown>,
    decoded?: Pick<
      Awaited<ReturnType<AiModelsService["getDecryptedKey"]>>,
      "apiStyle" | "baseUrl" | "modelName" | "defaultParams"
    >,
  ): {
    params: Record<string, unknown>;
    costCredits: number;
    durationSeconds: number | null;
  } {
    if (model.category !== "IMAGE2VIDEO") {
      return {
        params,
        costCredits: model.costCredits,
        durationSeconds: null,
      };
    }

    if (model.costCredits <= 0) {
      throw new BadRequestException("INVALID_MODEL_CREDIT_RATE");
    }

    const defaultParams = asRecord(model.defaultParams);
    const providerDefaults = decoded?.defaultParams ?? defaultParams;
    const combinedParams = {
      ...providerDefaults,
      ...params,
    };
    const isVolcengineSeedance =
      decoded &&
      isVolcengineVideoInvocation({
        apiStyle: decoded.apiStyle,
        baseUrl: decoded.baseUrl,
        params: combinedParams,
      });
    if (isVolcengineSeedance) {
      assertVolcengineSeedanceParams(decoded.modelName, combinedParams);
    }
    const durationSource =
      videoDurationParam(params) ??
      videoDurationParam(providerDefaults) ??
      DEFAULT_VIDEO_COSTING_SECONDS;
    const durationSeconds = normalizeVideoDurationSeconds(
      durationSource,
      isVolcengineSeedance
        ? {
            min: VOLCENGINE_SEEDANCE_MIN_SECONDS,
            max: isVolcengineSeedance15ProModel(decoded.modelName)
              ? VOLCENGINE_SEEDANCE_15_PRO_MAX_SECONDS
              : VOLCENGINE_SEEDANCE_20_MAX_SECONDS,
            rejectSmartDuration: true,
          }
        : undefined,
    );

    return {
      params: {
        ...params,
        duration: durationSeconds,
        seconds: String(durationSeconds),
      },
      costCredits: model.costCredits * durationSeconds,
      durationSeconds,
    };
  }

  private async ensureImageEditBackingModel(mode: { code: string; name: string; modelName: string }) {
    const existing =
      (await this.prisma.aIModel.findFirst({
        where: { category: "TEXT2IMAGE", isActive: true },
        orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
      })) ??
      (await this.prisma.aIModel.findFirst({
        where: { category: "TEXT2IMAGE" },
        orderBy: [{ sortOrder: "asc" }],
      }));
    if (existing) return existing;
    return this.prisma.aIModel.create({
      data: {
        code: `image-edit-backing-${mode.code}`,
        displayName: `Image edit backing model (${mode.name})`,
        category: "TEXT2IMAGE",
        baseUrl: "",
        apiKeyEnc: "",
        modelName: mode.modelName,
        costCredits: 0,
        accessLevel: "FREE",
        defaultParams: {} as Prisma.InputJsonValue,
        rateLimitPerMinute: 60,
        isActive: false,
        isDefault: false,
        sortOrder: 9999,
      },
    });
  }

  private creditSpendReason(model: AIModel, durationSeconds: number | null) {
    if (model.category !== "IMAGE2VIDEO" || !durationSeconds) {
      return `Generation: ${model.code}`;
    }
    return `Generation: ${model.code} (${model.costCredits}/s x ${durationSeconds}s)`;
  }

  private assertVideoReferenceRequirements(
    model: AIModel,
    params: Record<string, unknown>,
    inputAssetKey?: string,
  ) {
    if (model.category !== "IMAGE2VIDEO") return;
    const references = uniqueReferencesByKey(
      videoReferenceInputs(params, inputAssetKey),
      (reference) => this.oss.assetKeyFromUrl(reference),
    );
    const requirements = this.models.videoModelRequirements(model);
    if (
      !requirements.supportsReferenceImages &&
      references.length > 0
    ) {
      throw new BadRequestException("VIDEO_MODEL_DOES_NOT_SUPPORT_REFERENCES");
    }
    if (
      requirements.requiresReferenceImages &&
      references.length < requirements.minReferenceImages
    ) {
      throw new BadRequestException("VIDEO_REFERENCE_REQUIRED");
    }
    if (references.length > requirements.maxReferenceImages) {
      throw new BadRequestException("TOO_MANY_VIDEO_REFERENCES");
    }
  }

  private assertImageReferenceRequirements(
    model: AIModel,
    params: Record<string, unknown>,
  ) {
    if (model.category !== "TEXT2IMAGE") return;
    const references = uniqueReferencesByKey(
      text2ImageReferences(params),
      (reference) => this.oss.assetKeyFromUrl(reference),
    );
    const requirements = this.models.imageModelRequirements(model);
    if (!requirements.supportsReferenceImages && references.length > 0) {
      throw new BadRequestException("MODEL_DOES_NOT_SUPPORT_REFERENCE_IMAGES");
    }
    if (
      requirements.requiresReferenceImages &&
      references.length < requirements.minReferenceImages
    ) {
      throw new BadRequestException("REFERENCE_IMAGE_REQUIRED");
    }
    if (references.length > requirements.maxReferenceImages) {
      throw new BadRequestException("TOO_MANY_REFERENCE_IMAGES");
    }
  }

  private async reconcileStaleActiveJob<
    TJob extends GenerationJob & { model?: { displayName: string } | null },
  >(job: TJob): Promise<TJob> {
    let queueJob: Job | undefined;
    let retryableFinishedState: FinishedStatus | undefined;
    if (!isActiveGenerationJobStatus(job.status)) {
      return job;
    }

    try {
      queueJob = (await this.queue.getJob(job.id)) ?? undefined;
      if (queueJob) {
        const queueState = await queueJob.getState();
        if (
          queueState === "waiting" ||
          queueState === "active" ||
          queueState === "delayed" ||
          queueState === "prioritized"
        ) {
          return job;
        }

        if (queueState === "failed") {
          const upstreamActive = await this.recoverIfText2ImageUpstreamActive(
            job,
            queueJob,
            "failed",
          );
          if (upstreamActive) return upstreamActive;

          return this.failDesyncedJob(
            job,
            queueJob.failedReason?.trim() ||
              "Generation worker failed after the upstream provider returned an error.",
          );
        }
        if (queueState === "completed") {
          retryableFinishedState = "completed";
        }
      }
    } catch (err) {
      this.logger.warn(
        `Unable to inspect BullMQ state for generation job ${job.id}: ${(err as Error).message}`,
      );
    }

    const now = Date.now();
    const activityAt = job.startedAt ?? job.updatedAt ?? job.createdAt;
    if (!activityAt) return job;
    const ageMs = now - activityAt.getTime();
    if (ageMs < ACTIVE_JOB_STALE_MS) return job;

    const upstreamActive = await this.recoverIfText2ImageUpstreamActive(
      job,
      queueJob,
      retryableFinishedState,
    );
    if (upstreamActive) return upstreamActive;

    const errorMessage =
      job.status === "queued"
        ? "Generation job stayed queued for too long without a live queue worker."
        : "Generation job stopped reporting progress and no live queue worker was found.";
    return this.failDesyncedJob(job, errorMessage);
  }

  private async recoverIfText2ImageUpstreamActive<
    TJob extends GenerationJob & { model?: { displayName: string } | null },
  >(job: TJob, queueJob?: Job, queueJobState?: FinishedStatus) {
    if ((job.type !== "TEXT2IMAGE" && job.type !== "IMAGE_EDIT") || !job.providerJobId) return null;

    try {
      const invocation = await this.text2ImageInvocationForJob(job);
      if (invocation.apiStyle === "OPENAI" && !invocation.statusUrl) return null;
      let status: string | undefined;
      try {
        status = normalizeProviderStatus(
          await this.provider.getText2ImageTaskStatus(
            {
              apiKey: invocation.apiKey,
              baseUrl: invocation.baseUrl,
              apiStyle: invocation.apiStyle,
              statusUrl: invocation.statusUrl,
              modelName: invocation.modelName,
              prompt: job.prompt,
              params: invocation.params,
            },
            job.providerJobId,
          ),
        );
      } catch (err) {
        if (!(err instanceof Text2ImageTaskStillRunningError)) throw err;
        status = "running";
      }
      if (!status || !UPSTREAM_ACTIVE_STATUSES.has(status)) return null;

      if (queueJob && queueJobState) {
        await queueJob.retry(queueJobState, {
          resetAttemptsMade: true,
          resetAttemptsStarted: true,
        });
      } else {
        await this.queue.add(
          "TEXT2IMAGE",
          { jobId: job.id },
          {
            jobId: job.id,
            attempts: 1,
            delay: TEXT2IMAGE_RECOVERY_DELAY_MS,
          },
        );
      }
      const updated = await this.prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: "running",
          progress: Math.max(job.progress, 20),
          errorMessage: null,
          finishedAt: null,
        },
        include: { model: { select: { displayName: true } } },
      });
      return updated as TJob;
    } catch (err) {
      this.logger.warn(
        `Unable to verify upstream text2image task ${job.providerJobId} for job ${job.id}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  private async deleteVideoJobWithUpstreamCheck<
    TJob extends GenerationJob & { model?: { displayName: string } | null },
  >(job: TJob) {
    if (!job.providerJobId) {
      await this.prisma.generationJob.delete({ where: { id: job.id } });
      return { count: 1 };
    }

    const invocation = await this.videoInvocationForJob(job);
    if (
      !isVolcengineVideoInvocation({
        apiStyle: invocation.apiStyle,
        baseUrl: invocation.baseUrl,
        params: invocation.params,
      })
    ) {
      await this.prisma.generationJob.delete({ where: { id: job.id } });
      return { count: 1 };
    }

    let upstreamStatus: string | undefined;
    try {
      const upstream = await this.provider.getVideoTaskResult(
        {
          apiKey: invocation.apiKey,
          baseUrl: invocation.baseUrl,
          apiStyle: invocation.apiStyle,
          statusUrl: invocation.statusUrl,
          modelName: invocation.modelName,
          prompt: job.prompt,
          params: invocation.params,
        },
        job.providerJobId,
      );
      upstreamStatus = normalizeProviderStatus(upstream?.status);
    } catch (err) {
      const message = generationErrorLogMessage(err);
      if (!/404|not found/i.test(message)) throw err;
      upstreamStatus = undefined;
    }

    if (upstreamStatus === "running") {
      throw new ConflictException("VIDEO_TASK_RUNNING_CANNOT_CANCEL");
    }

    if (upstreamStatus && !VOLCENGINE_VIDEO_DELETABLE_STATUSES.has(upstreamStatus)) {
      throw new ConflictException("VIDEO_TASK_STATUS_CANNOT_DELETE");
    }

    const deleteResult = upstreamStatus
      ? await this.provider.deleteVideoTask(
          {
            apiKey: invocation.apiKey,
            baseUrl: invocation.baseUrl,
            apiStyle: invocation.apiStyle,
            statusUrl: invocation.statusUrl,
            modelName: invocation.modelName,
            prompt: job.prompt,
            params: invocation.params,
          },
          job.providerJobId,
          upstreamStatus,
        )
      : { action: "not_found" as const };

    if (upstreamStatus === "queued" || deleteResult.action === "cancelled") {
      try {
        const queueJob = await this.queue.getJob(job.id);
        await queueJob?.remove();
      } catch (err) {
        this.logger.warn(
          `Unable to remove queued video job ${job.id} from BullMQ after upstream cancellation: ${(err as Error).message}`,
        );
      }
      await this.prisma.generationJob.updateMany({
        where: { id: job.id, status: { in: ["queued", "running"] } },
        data: {
          status: "canceled",
          progress: 100,
          errorMessage: null,
          finishedAt: new Date(),
        },
      });
      await this.refundGenerationJobOnce(
        job.userId,
        job.costCredits,
        `Refund canceled job ${job.id}`,
        job.id,
      );
      return { count: 1, action: "cancelled", providerJobId: job.providerJobId };
    }

    await this.prisma.generationJob.delete({ where: { id: job.id } });
    return {
      count: 1,
      action: deleteResult.action === "not_found" ? "not_found" : "deleted",
      providerJobId: job.providerJobId,
    };
  }

  private async failDesyncedJob<
    TJob extends GenerationJob & { model?: { displayName: string } | null },
  >(job: TJob, errorMessage: string): Promise<TJob> {
    const finishedAt = job.finishedAt ?? new Date();
    const updated = await this.prisma.generationJob.updateMany({
      where: {
        id: job.id,
        status: job.status,
      },
      data: {
        status: "failed",
        progress: 100,
        errorMessage,
        finishedAt,
      },
    });

    if (updated.count === 0) {
      const fresh = await this.prisma.generationJob.findUnique({
        where: { id: job.id },
        include: { model: { select: { displayName: true } } },
      });
      return (fresh ?? job) as TJob;
    }

    await this.refundGenerationJobOnce(
      job.userId,
      job.costCredits,
      `Refund failed job ${job.id}`,
      job.id,
    );

    return {
      ...job,
      status: "failed",
      progress: 100,
      errorMessage,
      finishedAt,
    } as TJob;
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

  private async markReconciledJobFailed<TJob extends GenerationJob>(
    job: TJob,
    errorMessage: string,
  ) {
    const failed = await this.prisma.generationJob.updateMany({
      where: {
        id: job.id,
        status: { in: ["queued", "running", "failed"] },
      },
      data: {
        status: "failed",
        progress: 100,
        errorMessage,
        finishedAt: job.finishedAt ?? new Date(),
      },
    });
    if (failed.count > 0) {
      await this.refundGenerationJobOnce(
        job.userId,
        job.costCredits,
        `Refund failed job ${job.id}`,
        job.id,
      );
    }
    return { jobId: job.id, action: "failed", reason: errorMessage };
  }

  private async legacyCrexInvocationForJob<TJob extends GenerationJob>(
    job: TJob,
    fallback: Text2ImageInvocation,
  ): Promise<Text2ImageInvocation | null> {
    if (job.providerBaseUrlSnapshot || !/^img_/i.test(job.providerJobId ?? "")) {
      return null;
    }
    const providerConfig = await this.prisma.modelProviderConfig.findFirst({
      where: { apiStyle: "CREX", isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true },
    });
    if (!providerConfig) return null;
    const provider = await this.providers.resolve(providerConfig.id);
    if (!provider?.statusUrl) return null;
    return {
      providerId: provider.id,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      apiStyle: provider.apiStyle,
      statusUrl: provider.statusUrl,
      modelName: fallback.modelName,
      params: applyProviderPollConfig(
        {
          ...provider.extra,
          ...fallback.params,
        },
        provider,
      ),
      maxPollDurationMs: provider.maxPollDurationMs,
      pollIntervalMs: provider.pollIntervalMs,
      maxPollAttempts: provider.maxPollAttempts,
    };
  }

  private async persistText2ImageItems<TJob extends GenerationJob>(
    job: TJob,
    items: GeneratedItem[],
  ) {
    const assetIds: string[] = [];
    const providerOutputUrls: string[] = [];
    const providerJobId =
      items
        .map((item) => item.providerJobId)
        .find((value): value is string => Boolean(value)) ?? job.providerJobId;
    const rememberProviderUrl = (url: string | undefined | null) => {
      if (url && !providerOutputUrls.includes(url))
        providerOutputUrls.push(url);
    };

    for (const item of items) {
      const directProviderUrl = providerUrlForItem(item);
      rememberProviderUrl(directProviderUrl);
      const materialized = await this.provider.materialize(
        item,
        item.contentType ?? "image/png",
      );
      rememberProviderUrl(materialized.url ?? directProviderUrl);
      if (!materialized.bytes) {
        throw new Error(
          "Provider output could not be materialized for OSS persistence",
        );
      }
      const { asset } = await this.oss.putBuffer(
        `generations/${job.userId}/${job.id}`,
        materialized.bytes,
        materialized.contentType ?? item.contentType ?? "image/png",
        {
          userId: job.userId,
          visibility: "PRIVATE",
          requireUpload: true,
        },
      );
      const outputIndex = assetIds.length;
      assetIds.push(asset.id);
      await this.outputMedia.ensureForAsset({
        userId: job.userId,
        jobId: job.id,
        outputIndex,
        assetId: asset.id,
      });
    }

    if (!assetIds.length) {
      throw new Error("Provider returned no downloadable image outputs");
    }

    await this.prisma.generationJob.update({
      where: { id: job.id },
      data: {
        status: "succeeded",
        progress: 100,
        outputAssetIds: assetIds as Prisma.InputJsonValue,
        providerOutputUrls: providerOutputUrls as Prisma.InputJsonValue,
        providerJobId,
        errorMessage: null,
        finishedAt: new Date(),
      },
    });
    return { assetIds, providerOutputUrls, providerJobId };
  }

  private async toPublicJob(
    job: GenerationJob & { model?: { displayName: string } | null },
    modelDisplayName?: string,
  ) {
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
      modelDisplayName: modelDisplayName ?? job.model?.displayName ?? null,
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
      errorMessage: publicGenerationErrorMessage(
        job.errorMessage,
        null,
      ),
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    };
  }

  private async resolveText2ImageReferenceImages(
    userId: string,
    jobId: string,
    params: Record<string, unknown>,
  ) {
    const references = text2ImageReferences(params);
    if (!references.length) return params;

    const resolved: string[] = [];
    const referenceMediaIds = text2ImageReferenceMediaIds(params);
    if (hasText2ImageReferenceMediaIds(params) && referenceMediaIds.length !== references.length) {
      throw new BadRequestException("REFERENCE_MEDIA_IDS_MUST_ALIGN_WITH_REFERENCE_IMAGES");
    }
    if (!referenceMediaIds.some(Boolean) && params.preserveReferenceImageUrls === true) {
      return params;
    }
    for (const [index, item] of references.entries()) {
      const mediaId = referenceMediaIds[index]?.trim();
      if (mediaId) {
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

  private async imageEditReferenceBuffer(value: string) {
    const inline = dataUrlToBuffer(value);
    if (inline) return inline.buffer;

    const key = this.oss.assetKeyFromUrl(value);
    const url = key ? (await this.oss.signGet(key, 24 * 3600)) ?? value : value;
    if (!/^https?:\/\//i.test(url)) {
      throw new BadRequestException("IMAGE_EDIT_BASE64_SOURCE_REQUIRED");
    }

    const res = await fetch(url);
    if (!res.ok) {
      throw new BadRequestException("IMAGE_EDIT_SOURCE_DOWNLOAD_FAILED");
    }
    return Buffer.from(await res.arrayBuffer());
  }

  private async resolveImageEditReferenceImages(
    userId: string,
    jobId: string,
    params: Record<string, unknown>,
  ) {
    if (
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
      if (!mask) throw new BadRequestException("IMAGE_EDIT_MASK_REQUIRED");
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

    const references = imageEditReferences(params);
    if (!references.length) return params;

    const resolved = new Map<string, string>();
    for (const item of references) {
      if (resolved.has(item)) continue;
      const dataUrl = dataUrlToBuffer(item);
      if (dataUrl) {
        const { key } = await this.oss.putBuffer(
          `generations/${userId}/${jobId}/inputs`,
          dataUrl.buffer,
          dataUrl.contentType,
          { userId, visibility: "PRIVATE" },
        );
        resolved.set(item, (await this.oss.signGet(key, 24 * 3600)) ?? item);
        continue;
      }

      const key = this.oss.assetKeyFromUrl(item);
      const signed = key ? await this.oss.signGet(key, 24 * 3600) : null;
      resolved.set(item, signed ?? item);
    }

    const replace = (value: unknown) =>
      typeof value === "string" ? resolved.get(value) ?? value : value;
    const referenceImages = stringArray(params.reference_images).map((value) =>
      resolved.get(value) ?? value,
    );

    return {
      ...params,
      input_image: replace(params.input_image),
      inputImage: undefined,
      image: replace(params.image),
      image_url: replace(params.image_url),
      imageUrl: undefined,
      mask: replace(params.mask),
      mask_url: replace(params.mask_url),
      maskUrl: undefined,
      reference_images: referenceImages.length ? referenceImages : undefined,
      referenceImages: undefined,
      reference_image: undefined,
      referenceImage: undefined,
    };
  }
}
