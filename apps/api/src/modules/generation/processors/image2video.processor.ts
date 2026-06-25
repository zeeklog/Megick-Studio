import { Logger, Injectable } from "@nestjs/common";
import { Job } from "bullmq";
import { PrismaService } from "nestjs-prisma";
import { OssService } from "../../oss/oss.service";
import { CreditsService } from "../../credits/credits.service";
import { GenerationProviderClient } from "../generation-provider.client";
import { JobsService } from "../jobs.service";
import {
  generationErrorLogMessage,
  generationErrorLogStack,
  loggedPublicGenerationErrorMessage,
} from "../generation-errors";

const TERMINAL_STATUSES = new Set(["succeeded", "failed", "canceled"]);

function asRecord(value: unknown): Record<string, unknown> {
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

function mediaItems(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function videoReferenceImages(params: Record<string, unknown>) {
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
  ].filter(
    (item, index, items) => item.trim() && items.indexOf(item) === index,
  );
}

function uniqueNonEmpty(values: string[]) {
  return values.filter(
    (item, index, items) => item.trim() && items.indexOf(item) === index,
  );
}

@Injectable()
export class Image2VideoProcessor {
  private readonly logger = new Logger(Image2VideoProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oss: OssService,
    private readonly credits: CreditsService,
    private readonly provider: GenerationProviderClient,
    private readonly jobs: JobsService,
  ) {}

  async process(job: Job<{ jobId: string }>): Promise<unknown> {
    const { jobId } = job.data;
    const dbJob = await this.prisma.generationJob.findUnique({
      where: { id: jobId },
    });
    if (!dbJob) return { error: "Job not found" };
    if (TERMINAL_STATUSES.has(dbJob.status)) {
      return { skipped: true, status: dbJob.status };
    }
    const claimed = await this.prisma.generationJob.updateMany({
      where: { id: jobId, status: "queued" },
      data: {
        status: "running",
        progress: 10,
        startedAt: new Date(),
        errorMessage: null,
      },
    });
    if (claimed.count === 0) {
      const current = await this.prisma.generationJob.findUnique({
        where: { id: jobId },
        select: { status: true },
      });
      return { skipped: true, status: current?.status ?? dbJob.status };
    }
    try {
      const invocation = await this.jobs.videoInvocationForJob(dbJob);
      const params = {
        ...invocation.params,
      };
      const resolvedInput = await this.resolveInputMedia(
        dbJob.userId,
        dbJob.id,
        dbJob.inputAssetKey,
        params,
      );
      const items = await this.provider.image2video({
        apiKey: invocation.apiKey,
        baseUrl: invocation.baseUrl,
        apiStyle: invocation.apiStyle,
        statusUrl: invocation.statusUrl,
        modelName: invocation.modelName,
        prompt: dbJob.prompt,
        params: resolvedInput.params,
        imageUrls: resolvedInput.urls,
        existingProviderJobId:
          typeof dbJob.providerJobId === "string" && dbJob.providerJobId.trim()
            ? dbJob.providerJobId.trim()
            : undefined,
        onProviderJobId: async (providerJobId) => {
          await this.prisma.generationJob.updateMany({
            where: { id: dbJob.id, status: "running" },
            data: { providerJobId },
          });
        },
        onProgress: async (progress) => {
          await this.prisma.generationJob.updateMany({
            where: { id: dbJob.id, status: "running" },
            data: { progress },
          });
        },
      });

      const assetIds: string[] = [];
      const providerOutputUrls: string[] = [];
      const rememberProviderUrl = (url: string | undefined) => {
        if (url && !providerOutputUrls.includes(url)) providerOutputUrls.push(url);
      };
      for (const it of items) {
        const providerUrl = it.url ?? it.fallbackUrl;
        rememberProviderUrl(providerUrl);

        let materialized: typeof it | null = null;
        try {
          materialized = await this.provider.materialize(
            it,
            it.contentType ?? "video/mp4",
          );
        } catch (downloadErr) {
          this.logger.warn(
            `Generated video download failed for job ${dbJob.id}: ${(downloadErr as Error).message}`,
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
            materialized.contentType ?? "video/mp4",
            {
              userId: dbJob.userId,
              visibility: "PRIVATE",
              requireUpload: true,
            },
          );
          assetIds.push(asset.id);
        } catch (uploadErr) {
          this.logger.error(
            `OSS upload failed for image2video job ${dbJob.id}: ${(uploadErr as Error).message}`,
          );
          if (it.requireOssPersistence) throw uploadErr;
          if (!providerUrl) throw uploadErr;
        }
      }

      if (!assetIds.length && !providerOutputUrls.length) {
        throw new Error("Provider returned no downloadable video outputs");
      }

      await this.prisma.generationJob.update({
        where: { id: jobId },
        data: {
          status: "succeeded",
          progress: 100,
          outputAssetIds: assetIds,
          providerOutputUrls,
          errorMessage: null,
          finishedAt: new Date(),
        },
      });
      return { ok: true, assetIds, providerOutputUrls };
    } catch (err) {
      this.logger.error(
        `Image2Video worker failed for job=${jobId} user=${dbJob.userId} model=${dbJob.modelCode}: ${generationErrorLogMessage(err)}`,
        generationErrorLogStack(err),
      );
      await this.prisma.generationJob.update({
        where: { id: jobId },
        data: {
          status: "failed",
          progress: 100,
          errorMessage: loggedPublicGenerationErrorMessage(
            err,
            this.logger,
            `Image2Video worker failed for job=${jobId} user=${dbJob.userId} model=${dbJob.modelCode}`,
          ),
          finishedAt: new Date(),
        },
      });
      await this.credits.refund(
        dbJob.userId,
        dbJob.costCredits,
        `Refund failed job ${dbJob.id}`,
        "GENERATION_JOB",
        dbJob.id,
      );
      throw err;
    }
  }

  private async resolveInputMedia(
    userId: string,
    jobId: string,
    inputAssetKey: string | null,
    params: Record<string, unknown>,
  ) {
    const raw = videoReferenceImages(params);

    if (inputAssetKey) {
      const signed = await this.oss.signGet(inputAssetKey, 24 * 3600);
      if (signed) raw.unshift(signed);
    }

    const deduped = [...new Set(raw.map((url) => url.trim()).filter(Boolean))];
    const resolvedByInput = new Map<string, string>();
    const urls: string[] = [];
    for (const item of deduped) {
      const resolved = await this.resolveInputMediaUrl(userId, jobId, item);
      resolvedByInput.set(item, resolved);
      urls.push(resolved);
    }

    return {
      params: this.rewriteInputMediaParams(params, resolvedByInput),
      urls: uniqueNonEmpty(urls),
    };
  }

  private async resolveInputMediaUrl(
    userId: string,
    jobId: string,
    item: string,
  ) {
    const dataUrl = dataUrlToBuffer(item);
    if (dataUrl) {
      const { key } = await this.oss.putBuffer(
        `generations/${userId}/${jobId}/inputs`,
        dataUrl.buffer,
        dataUrl.contentType,
        { userId, visibility: "PRIVATE" },
      );
      return (await this.oss.signGet(key, 24 * 3600)) ?? item;
    }

    const key = this.oss.assetKeyFromUrl(item);
    return key ? ((await this.oss.signGet(key, 24 * 3600)) ?? item) : item;
  }

  private rewriteInputMediaParams(
    params: Record<string, unknown>,
    resolvedByInput: Map<string, string>,
  ) {
    const resolveUrl = (value: unknown) => {
      if (typeof value !== "string") return value;
      return resolvedByInput.get(value.trim()) ?? value;
    };
    const resolveArray = (value: unknown) =>
      Array.isArray(value)
        ? uniqueNonEmpty(
            value
              .map((item) => resolveUrl(item))
              .filter((item): item is string => typeof item === "string"),
          )
        : value;
    const resolveMedia = (value: unknown) =>
      mediaItems(value).map((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return item;
        const record = item as Record<string, unknown>;
        const currentUrl = record.url ?? record.src;
        return {
          ...record,
          ...(typeof currentUrl === "string"
            ? { url: resolveUrl(currentUrl) }
            : {}),
        };
      });

    return {
      ...params,
      media: Array.isArray(params.media) ? resolveMedia(params.media) : params.media,
      imageUrls: resolveArray(params.imageUrls),
      videoUrls: resolveArray(params.videoUrls),
      images: resolveArray(params.images),
      videos: resolveArray(params.videos),
      reference_images: resolveArray(params.reference_images),
      referenceImages: resolveArray(params.referenceImages),
      reference_videos: resolveArray(params.reference_videos),
      referenceVideos: resolveArray(params.referenceVideos),
      image: resolveUrl(params.image),
      imageUrl: resolveUrl(params.imageUrl),
      video: resolveUrl(params.video),
      videoUrl: resolveUrl(params.videoUrl),
      input_reference: resolveUrl(params.input_reference),
      referenceImage: resolveUrl(params.referenceImage),
      reference_image: resolveUrl(params.reference_image),
      referenceImageUrl: resolveUrl(params.referenceImageUrl),
      referenceVideo: resolveUrl(params.referenceVideo),
      reference_video: resolveUrl(params.reference_video),
      referenceVideoUrl: resolveUrl(params.referenceVideoUrl),
    };
  }
}
