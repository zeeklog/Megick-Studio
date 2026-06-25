import { BadGatewayException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "nestjs-prisma";
import { randomId } from "@/common/random-id";
import { AdvancedAccessService } from "@/common/services/advanced-access.service";
import { OssService } from "../oss/oss.service";
import {
  FREE_IMAGE_WATERMARK_PROCESS,
  mediaOutputProxyUrl,
} from "../generation/generation-output-urls";
import type { GenerationJobTypeEnum, OssAsset, Prisma } from "@prisma/client";

export const GENERATED_IMAGE_THUMBNAIL_PROCESS =
  "image/resize,m_lfit,w_320,h_320/format,webp/quality,q_72";

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

function mediaKindForAsset(type: GenerationJobTypeEnum | string | null, contentType: string) {
  if (type === "IMAGE2VIDEO" || contentType.startsWith("video/")) return "VIDEO";
  if (contentType.startsWith("image/")) return "IMAGE";
  if (contentType.startsWith("audio/")) return "AUDIO";
  return "FILE";
}

function shouldWatermarkGeneratedOutput(type: GenerationJobTypeEnum | string | null, kind: string) {
  return kind === "IMAGE" && (type === "TEXT2IMAGE" || type === "IMAGE_EDIT");
}

function nullableJson(value: Prisma.JsonValue | null | undefined) {
  return value === null || typeof value === "undefined"
    ? undefined
    : (value as Prisma.InputJsonValue);
}

@Injectable()
export class GenerationOutputMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oss: OssService,
    private readonly advancedAccess: AdvancedAccessService,
  ) {}

  async ensureForAsset(input: {
    userId: string;
    jobId: string;
    outputIndex: number;
    assetId: string;
  }) {
    const record = await this.prisma.generationOutputMedia.upsert({
      where: {
        jobId_outputIndex: {
          jobId: input.jobId,
          outputIndex: input.outputIndex,
        },
      },
      update: { userId: input.userId, assetId: input.assetId },
      create: {
        id: `media_${randomId(24)}`,
        userId: input.userId,
        jobId: input.jobId,
        outputIndex: input.outputIndex,
        assetId: input.assetId,
      },
      select: { id: true },
    });
    await this.ensureMediaCenterItem({
      id: record.id,
      userId: input.userId,
      jobId: input.jobId,
      outputIndex: input.outputIndex,
      assetId: input.assetId,
    });
    return record.id;
  }

  async publicRefForAsset(input: {
    userId: string;
    jobId: string;
    outputIndex: number;
    type: GenerationJobTypeEnum | string;
    asset: OssAsset;
    assetUrl: string | null;
    hasAdvancedAccess: boolean;
  }) {
    const mediaId = await this.ensureForAsset({
      userId: input.userId,
      jobId: input.jobId,
      outputIndex: input.outputIndex,
      assetId: input.asset.id,
    });
    if (input.type !== "TEXT2IMAGE" && input.type !== "IMAGE_EDIT") {
      return { url: input.assetUrl, mediaId };
    }
    if (input.hasAdvancedAccess) return { url: input.assetUrl, mediaId };
    return { url: mediaOutputProxyUrl(mediaId), mediaId };
  }

  async getOutputContent(
    mediaId: string,
    userId: string,
    input: { variant?: "thumbnail" } = {},
  ) {
    const item = await this.prisma.mediaCenterItem.findFirst({
      where: { id: mediaId, userId },
      include: { ossAsset: true },
    });
    if (item) {
      if (input.variant === "thumbnail" && item.kind === "IMAGE") {
        const url = await this.oss.signGet(item.ossKey, 3600, {
          process: GENERATED_IMAGE_THUMBNAIL_PROCESS,
        });
        if (!url) throw new BadGatewayException("THUMBNAIL_URL_UNAVAILABLE");
        return this.fetchExternalOutputContent(url, "TEXT2IMAGE");
      }

      const hasAdvancedAccess = await this.advancedAccess.hasAdvancedAccess(userId);
      if (item.requiresWatermark && !hasAdvancedAccess) {
        const url = await this.oss.signGet(item.ossKey, 3600, {
          process: item.watermarkProcess ?? FREE_IMAGE_WATERMARK_PROCESS,
        });
        if (!url) throw new BadGatewayException("WATERMARK_URL_UNAVAILABLE");
        await this.prisma.mediaCenterItem.update({
          where: { id: item.id },
          data: {
            watermarkedUrl: url,
            watermarkedUrlExpiresAt: new Date(Date.now() + 3600 * 1000),
          },
        });
        return this.fetchExternalOutputContent(url, item.kind === "VIDEO" ? "IMAGE2VIDEO" : "TEXT2IMAGE");
      }

      const content = await this.oss.getAuthorizedAssetContent(item.ossKey, {
        id: userId,
      });
      return {
        content: content.content,
        contentType: content.contentType,
        sizeBytes: content.sizeBytes,
      };
    }

    throw new NotFoundException("REFERENCE_MEDIA_NOT_FOUND");
  }

  thumbnailUrl(mediaId: string | null | undefined) {
    return mediaId ? mediaOutputProxyUrl(mediaId, "thumbnail") : null;
  }

  async publicObjectUrlForMediaId(mediaId: string, userId: string) {
    const item = await this.prisma.mediaCenterItem.findFirst({
      where: {
        id: mediaId,
        userId,
        status: "READY",
        kind: { in: ["IMAGE", "VIDEO"] },
      },
      select: { id: true, ossKey: true, originalOssUrl: true },
    });
    if (item) {
      const original = item.originalOssUrl ?? await this.oss.publicObjectUrl(item.ossKey);
      if (!original) throw new BadGatewayException("REFERENCE_MEDIA_PUBLIC_URL_UNAVAILABLE");
      if (!item.originalOssUrl) {
        await this.prisma.mediaCenterItem.update({
          where: { id: item.id },
          data: { originalOssUrl: original },
        });
      }
      return original;
    }
    throw new NotFoundException("REFERENCE_MEDIA_NOT_FOUND");
  }

  private async ensureMediaCenterItem(input: {
    id: string;
    userId: string;
    jobId: string;
    outputIndex: number;
    assetId: string;
  }) {
    const [asset, job] = await Promise.all([
      this.prisma.ossAsset.findUnique({ where: { id: input.assetId } }),
      this.prisma.generationJob.findUnique({
        where: { id: input.jobId },
        select: {
          type: true,
          prompt: true,
          params: true,
          providerOutputUrls: true,
          chatSessionId: true,
          finishedAt: true,
          createdAt: true,
        },
      }),
    ]);
    if (!asset) return;

    const kind = mediaKindForAsset(job?.type ?? null, asset.contentType);
    const requiresWatermark = shouldWatermarkGeneratedOutput(job?.type ?? null, kind);
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
    const [originalOssUrl, signedUrl, watermarkedUrl] = await Promise.all([
      this.oss.publicObjectUrl(asset.key),
      this.oss.signGet(asset.key, 24 * 3600),
      requiresWatermark
        ? this.oss.signGet(asset.key, 24 * 3600, {
            process: FREE_IMAGE_WATERMARK_PROCESS,
          })
        : Promise.resolve(null),
    ]);
    const providerSourceUrl =
      stringArray(job?.providerOutputUrls)[input.outputIndex] ?? null;

    await this.prisma.mediaCenterItem.upsert({
      where: {
        jobId_outputIndex: {
          jobId: input.jobId,
          outputIndex: input.outputIndex,
        },
      },
      update: {
        userId: input.userId,
        kind,
        source: "GENERATION",
        status: "READY",
        ossAssetId: asset.id,
        bucket: asset.bucket,
        ossKey: asset.key,
        originalOssUrl,
        signedUrl,
        signedUrlExpiresAt: signedUrl ? expiresAt : null,
        watermarkedUrl,
        watermarkedUrlExpiresAt: watermarkedUrl ? expiresAt : null,
        watermarkProcess: requiresWatermark ? FREE_IMAGE_WATERMARK_PROCESS : null,
        requiresWatermark,
        providerSourceUrl,
        prompt: job?.prompt ?? null,
        chatSessionId: job?.chatSessionId ?? null,
        contentType: asset.contentType,
        sizeBytes: asset.sizeBytes,
        width: asset.width,
        height: asset.height,
        durationMs: asset.durationMs,
        sha256: asset.sha256,
        visibility: asset.visibility,
        metadata: nullableJson(asset.metadata),
        sourceParams: nullableJson(job?.params),
      },
      create: {
        id: input.id,
        userId: input.userId,
        kind,
        source: "GENERATION",
        status: "READY",
        ossAssetId: asset.id,
        bucket: asset.bucket,
        ossKey: asset.key,
        originalOssUrl,
        signedUrl,
        signedUrlExpiresAt: signedUrl ? expiresAt : null,
        watermarkedUrl,
        watermarkedUrlExpiresAt: watermarkedUrl ? expiresAt : null,
        watermarkProcess: requiresWatermark ? FREE_IMAGE_WATERMARK_PROCESS : null,
        requiresWatermark,
        providerSourceUrl,
        prompt: job?.prompt ?? null,
        jobId: input.jobId,
        outputIndex: input.outputIndex,
        chatSessionId: job?.chatSessionId ?? null,
        contentType: asset.contentType,
        sizeBytes: asset.sizeBytes,
        width: asset.width,
        height: asset.height,
        durationMs: asset.durationMs,
        sha256: asset.sha256,
        visibility: asset.visibility,
        metadata: nullableJson(asset.metadata),
        sourceParams: nullableJson(job?.params),
        createdAt: job?.finishedAt ?? job?.createdAt ?? asset.createdAt,
      },
    });
  }

  private async fetchExternalOutputContent(
    url: string,
    type: GenerationJobTypeEnum,
  ) {
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
  }
}
