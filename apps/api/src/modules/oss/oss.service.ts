import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "nestjs-prisma";
import * as crypto from "node:crypto";
import type { AssetVisibility, OssAsset, Prisma } from "@prisma/client";
import { randomId } from "@/common/random-id";
import { AdvancedAccessService } from "@/common/services/advanced-access.service";
import { CloudOssService, type ResolvedOssConfig } from "../cloud-resources/cloud-oss.service";

interface OssClient {
  put(key: string, body: Buffer, opts?: unknown): Promise<{ url: string }>;
  get(key: string): Promise<{ content: Buffer | Uint8Array | string }>;
  signatureUrl(key: string, opts?: { expires: number; process?: string }): string;
}

const AVATAR_MAX_SIZE_BYTES = 2 * 1024 * 1024;
const AVATAR_CONTENT_TYPES = new Set(["image/png", "image/jpeg"]);

const ASSET_KEY_PREFIXES = [
  "avatars/",
  "generations/",
  "showcase/",
  "studio-edits/",
  "templates/",
];

function nullableJson(value: Prisma.JsonValue | null | undefined) {
  return value === null || typeof value === "undefined"
    ? undefined
    : (value as Prisma.InputJsonValue);
}

@Injectable()
export class OssService {
  private readonly logger = new Logger(OssService.name);
  private clientCache: OssClient | null = null;
  private clientCacheVersion = -1;
  private resolvedConfigCache: ResolvedOssConfig | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly advancedAccess: AdvancedAccessService,
    private readonly cloudOss: CloudOssService,
  ) {}

  private async client(): Promise<OssClient | null> {
    const configVersion = this.cloudOss.getVersion();
    if (this.clientCache && this.clientCacheVersion === configVersion) return this.clientCache;
    this.clientCache = null;
    this.resolvedConfigCache = await this.cloudOss.resolveConfig();
    const resolved = this.resolvedConfigCache;
    if (!resolved) {
      this.logger.warn("OSS not fully configured (will use local data URLs).");
      return null;
    }

    try {
      const mod = await import("ali-oss");
      const Ctor = (mod as unknown as { default?: unknown }).default ?? mod;
      this.clientCache = new (Ctor as any)(this.cloudOss.clientOptions(resolved));
      this.clientCacheVersion = configVersion;
    } catch (err) {
      this.logger.error(`ali-oss init failed: ${(err as Error).message}`);
      this.clientCache = null;
    }
    return this.clientCache;
  }

  private async resolvedConfig() {
    if (!this.resolvedConfigCache || this.clientCacheVersion !== this.cloudOss.getVersion()) {
      this.resolvedConfigCache = await this.cloudOss.resolveConfig();
    }
    return this.resolvedConfigCache;
  }

  /** Return the public-facing base URL for OSS assets, respecting OSS_DOMAIN first. */
  private async getPublicBaseUrl(): Promise<string | null> {
    return this.cloudOss.publicBaseUrl(await this.resolvedConfig());
  }

  /**
   * Rewrite a raw OSS endpoint URL to use the custom domain (OSS_DOMAIN).
   * e.g. https://bucket.oss-cn-shenzhen.aliyuncs.com/key?sig → https://file.megick.com/key?sig
   */
  private rewriteOssUrl(rawUrl: string): string {
    return this.cloudOss.rewriteOssUrl(rawUrl, this.resolvedConfigCache);
  }

  async putBuffer(
    keyPrefix: string,
    body: Buffer,
    contentType: string,
    opts: {
      userId?: string;
      visibility?: AssetVisibility;
      sha256?: string;
      requireUpload?: boolean;
    } = {},
  ) {
    const sha256 =
      opts.sha256 ?? crypto.createHash("sha256").update(body).digest("hex");
    const ext = this.guessExt(contentType);
    const key = `${keyPrefix.replace(/^\/+|\/+$/g, "")}/${sha256.slice(0, 8)}-${randomId(8)}${ext}`;

    let publicUrl: string | null = null;
    const client = await this.client();
    if (!client && opts.requireUpload)
      throw new BadRequestException("OSS_NOT_CONFIGURED");
    if (client) {
      try {
        const result = await client.put(key, body, {
          headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=31536000, immutable" },
        });
        publicUrl = this.rewriteOssUrl(result.url);
      } catch (err) {
        this.logger.error(`OSS putBuffer failed: ${(err as Error).message}`);
        if (opts.requireUpload) throw err;
      }
    }

    const asset = await this.prisma.ossAsset.upsert({
      where: { key },
      update: {},
      create: {
        userId: opts.userId,
        bucket: this.cloudOss.bucketName(await this.resolvedConfig()),
        key,
        contentType,
        sizeBytes: body.length,
        sha256,
        visibility: opts.visibility ?? "PRIVATE",
      },
    });

    return { key, url: publicUrl, asset };
  }

  async signGet(
    keyOrUrl: string | null | undefined,
    expiresSeconds = 3600,
    opts: { process?: string } = {},
  ): Promise<string | null> {
    const key =
      this.assetKeyFromUrl(keyOrUrl) ?? this.normalizeAssetKey(keyOrUrl);
    if (!key) return null;

    const client = await this.client();
    if (!client) {
      const base = await this.getPublicBaseUrl();
      if (!base) return null;
      const url = `${base}/${key}`;
      return opts.process
        ? `${url}?x-oss-process=${encodeURIComponent(opts.process)}`
        : url;
    }
    const signed = client.signatureUrl(key, {
      expires: expiresSeconds,
      ...(opts.process ? { process: opts.process } : {}),
    });
    // Rewrite raw OSS endpoint → custom domain so external services can access
    return this.rewriteOssUrl(signed);
  }

  async signAuthorizedGet(
    keyOrUrl: string | null | undefined,
    user: { id: string; isSuperAdmin?: boolean },
    expiresSeconds = 3600,
    opts: { process?: string } = {},
  ) {
    const key =
      this.assetKeyFromUrl(keyOrUrl) ?? this.normalizeAssetKey(keyOrUrl);
    if (!key) return null;

    const asset = await this.prisma.ossAsset.findUnique({ where: { key } });
    if (!asset) {
      if (this.isDirectUploadKeyForUser(key, user.id)) {
        return this.signGet(key, expiresSeconds, opts);
      }
      throw new NotFoundException();
    }
    if (
      asset.visibility !== "PUBLIC" &&
      asset.userId !== user.id &&
      !user.isSuperAdmin
    ) {
      throw new ForbiddenException();
    }
    await this.assertDirectAssetAccessAllowed(asset.id, user);
    return this.signGet(key, expiresSeconds, opts);
  }

  contentUrl(keyOrUrl: string) {
    const key =
      this.assetKeyFromUrl(keyOrUrl) ??
      keyOrUrl.replace(/^\/+/, "").split("?")[0];
    return `/api/oss/assets/content?key=${encodeURIComponent(key)}`;
  }

  async publicObjectUrl(keyOrUrl: string | null | undefined) {
    const key =
      this.assetKeyFromUrl(keyOrUrl) ?? this.normalizeAssetKey(keyOrUrl);
    if (!key) return null;
    const base = await this.getPublicBaseUrl();
    if (!base) return null;
    return `${base}/${key}`;
  }

  async cacheableSignedObjectUrl(
    keyOrUrl: string | null | undefined,
    expiresSeconds = 3600,
    opts: { process?: string } = {},
  ) {
    const url = await this.signGet(keyOrUrl, expiresSeconds, opts);
    return {
      url,
      expiresAt: url ? new Date(Date.now() + expiresSeconds * 1000) : null,
    };
  }

  assetKeyFromUrl(value: string | null | undefined): string | null {
    const raw = value?.trim();
    if (!raw || raw.startsWith("data:")) return null;

    const fromUrl = (url: URL) => {
      if (
        url.pathname === "/api/oss/assets/content" ||
        url.pathname === "/api/oss/sign"
      ) {
        return this.normalizeAssetKey(url.searchParams.get("key"));
      }
      const decodedPath = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      if (/^api\/oss\/(?:sign|assets\/content)\?/i.test(decodedPath)) {
        try {
          return this.normalizeAssetKey(
            new URL(`/${decodedPath}`, "http://local").searchParams.get("key"),
          );
        } catch {
          return null;
        }
      }
      const key = decodedPath.split(/[!@?]/)[0];
      return this.normalizeAssetKey(key);
    };

    try {
      if (/^https?:\/\//i.test(raw)) return fromUrl(new URL(raw));
      if (raw.startsWith("/")) return fromUrl(new URL(raw, "http://local"));
      if (/^api\/oss\/(?:sign|assets\/content)\?/i.test(raw)) {
        return fromUrl(new URL(`/${raw}`, "http://local"));
      }
    } catch {
      return null;
    }

    return this.normalizeAssetKey(
      raw.split("?")[0].replace(/^\/+/, "").split(/[!@]/)[0],
    );
  }

  async getAuthorizedAssetContent(
    keyOrUrl: string,
    user: { id: string; isSuperAdmin?: boolean },
  ) {
    const key = this.assetKeyFromUrl(keyOrUrl);
    if (!key) throw new BadRequestException("INVALID_ASSET_KEY");

    const asset = await this.prisma.ossAsset.findUnique({ where: { key } });
    if (!asset) {
      if (!this.isDirectUploadKeyForUser(key, user.id)) {
        throw new NotFoundException();
      }
      const content = await this.getObjectBuffer(key);
      return {
        key,
        content,
        contentType: this.guessContentTypeFromKey(key),
        sizeBytes: content.length,
      };
    }
    if (
      asset.visibility !== "PUBLIC" &&
      asset.userId !== user.id &&
      !user.isSuperAdmin
    ) {
      throw new ForbiddenException();
    }
    await this.assertDirectAssetAccessAllowed(asset.id, user);

    const content = await this.getObjectBuffer(key);
    return {
      key,
      content,
      contentType: asset.contentType,
      sizeBytes: asset.sizeBytes,
    };
  }

  async signPostObject(
    prefix: string,
    contentType?: string,
    maxSizeBytes = 50 * 1024 * 1024,
  ) {
    const resolved = await this.resolvedConfig();
    const region = resolved?.region ?? "";
    const ak = resolved?.accessKeyId ?? "";
    const sk = resolved?.accessKeySecret ?? "";
    const bucket = resolved?.bucket ?? "";
    if (!ak || !sk) return null;

    const expiration = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const conditions: unknown[] = [
      { bucket },
      ["starts-with", "$key", prefix],
      ["content-length-range", 0, maxSizeBytes],
    ];
    if (contentType) conditions.push(["eq", "$Content-Type", contentType]);

    const policy = Buffer.from(
      JSON.stringify({ expiration, conditions }),
    ).toString("base64");
    const signature = crypto
      .createHmac("sha1", sk)
      .update(policy)
      .digest("base64");

    // Use custom domain for the upload URL, fall back to OSS direct endpoint
    const host =
      (await this.getPublicBaseUrl()) ??
      `https://${bucket}.${region}.aliyuncs.com`;

    return {
      host,
      accessKeyId: ak,
      policy,
      signature,
      keyPrefix: prefix,
      expiration,
      maxSizeBytes,
    };
  }

  async registerDirectUpload(input: {
    key: string;
    userId: string;
    contentType?: string;
    sizeBytes?: number;
    visibility?: AssetVisibility;
  }) {
    const key = this.normalizeAssetKey(input.key);
    if (!key) throw new BadRequestException("INVALID_ASSET_KEY");
    if (!this.isDirectUploadKeyForUser(key, input.userId)) {
      throw new ForbiddenException();
    }

    const contentType =
      input.contentType?.trim().slice(0, 128) || this.guessContentTypeFromKey(key);
    const sizeBytes =
      typeof input.sizeBytes === "number" &&
      Number.isInteger(input.sizeBytes) &&
      input.sizeBytes >= 0
        ? input.sizeBytes
        : 0;
    if (key.startsWith(`avatars/${input.userId}/`)) {
      if (!AVATAR_CONTENT_TYPES.has(contentType.toLowerCase())) {
        throw new BadRequestException("INVALID_AVATAR_TYPE");
      }
      if (sizeBytes > AVATAR_MAX_SIZE_BYTES) {
        throw new BadRequestException("AVATAR_TOO_LARGE");
      }
    }
    const visibility = input.visibility ?? "PRIVATE";
    const existing = await this.prisma.ossAsset.findUnique({ where: { key } });
    if (existing) {
      if (existing.userId && existing.userId !== input.userId) {
        throw new ForbiddenException();
      }
      const asset = await this.prisma.ossAsset.update({
        where: { key },
        data: {
          userId: existing.userId ?? input.userId,
          contentType,
          sizeBytes,
          visibility,
        },
      });
      const media = await this.ensureUserUploadMediaCenterItem(asset);
      return { ...asset, mediaId: media?.id ?? null };
    }

    const asset = await this.prisma.ossAsset.create({
      data: {
        userId: input.userId,
        bucket: this.cloudOss.bucketName(await this.resolvedConfig()),
        key,
        contentType,
        sizeBytes,
        visibility,
      },
    });
    const media = await this.ensureUserUploadMediaCenterItem(asset);
    return { ...asset, mediaId: media?.id ?? null };
  }

  private async ensureUserUploadMediaCenterItem(asset: OssAsset) {
    if (!asset.userId) return null;
    const kind = this.mediaKindFromContentType(asset.contentType);
    const [originalOssUrl, signed] = await Promise.all([
      this.publicObjectUrl(asset.key),
      this.cacheableSignedObjectUrl(asset.key, 24 * 3600),
    ]);

    return this.prisma.mediaCenterItem.upsert({
      where: { ossAssetId: asset.id },
      update: {
        userId: asset.userId,
        kind,
        source: "USER_UPLOAD",
        status: "READY",
        bucket: asset.bucket,
        ossKey: asset.key,
        originalOssUrl,
        signedUrl: signed.url,
        signedUrlExpiresAt: signed.expiresAt,
        contentType: asset.contentType,
        sizeBytes: asset.sizeBytes,
        width: asset.width,
        height: asset.height,
        durationMs: asset.durationMs,
        sha256: asset.sha256,
        visibility: asset.visibility,
        metadata: nullableJson(asset.metadata),
      },
      create: {
        id: `media_${randomId(24)}`,
        userId: asset.userId,
        kind,
        source: "USER_UPLOAD",
        status: "READY",
        ossAssetId: asset.id,
        bucket: asset.bucket,
        ossKey: asset.key,
        originalOssUrl,
        signedUrl: signed.url,
        signedUrlExpiresAt: signed.expiresAt,
        requiresWatermark: false,
        contentType: asset.contentType,
        sizeBytes: asset.sizeBytes,
        width: asset.width,
        height: asset.height,
        durationMs: asset.durationMs,
        sha256: asset.sha256,
        visibility: asset.visibility,
        metadata: nullableJson(asset.metadata),
        createdAt: asset.createdAt,
      },
    });
  }

  private guessExt(contentType: string) {
    if (contentType.startsWith("image/png")) return ".png";
    if (contentType.startsWith("image/jpeg")) return ".jpg";
    if (contentType.startsWith("image/webp")) return ".webp";
    if (contentType.startsWith("image/gif")) return ".gif";
    if (contentType.startsWith("video/mp4")) return ".mp4";
    if (contentType.startsWith("video/webm")) return ".webm";
    if (contentType.startsWith("audio/mpeg")) return ".mp3";
    return "";
  }

  private guessContentTypeFromKey(key: string) {
    const lower = key.toLowerCase().split("?")[0];
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".mp4")) return "video/mp4";
    if (lower.endsWith(".mov")) return "video/quicktime";
    if (lower.endsWith(".webm")) return "video/webm";
    if (lower.endsWith(".mp3")) return "audio/mpeg";
    return "application/octet-stream";
  }

  private mediaKindFromContentType(contentType: string) {
    if (contentType.startsWith("image/")) return "IMAGE";
    if (contentType.startsWith("video/")) return "VIDEO";
    if (contentType.startsWith("audio/")) return "AUDIO";
    return "FILE";
  }

  private normalizeAssetKey(value: string | null | undefined) {
    const key = value?.trim().replace(/^\/+/, "");
    if (!key || key.includes("..")) return null;
    return ASSET_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
      ? key
      : null;
  }

  private isDirectUploadKeyForUser(key: string, userId: string) {
    return [
      `generations/references/${userId}/`,
      `templates/examples/${userId}/`,
      `templates/references/${userId}/`,
      `showcase/${userId}/`,
      `studio-edits/${userId}/`,
      `avatars/${userId}/`,
    ].some((prefix) => key.startsWith(prefix));
  }

  private async assertDirectAssetAccessAllowed(
    assetId: string,
    user: { id: string; isSuperAdmin?: boolean },
  ) {
    if (user.isSuperAdmin) return;
    if (await this.advancedAccess.hasAdvancedAccess(user.id)) return;

    const generatedImage = await this.prisma.generationOutputMedia.findFirst({
      where: {
        assetId,
        job: { type: { in: ["TEXT2IMAGE", "IMAGE_EDIT"] } },
      },
      select: { id: true },
    });
    if (generatedImage) throw new ForbiddenException();

    const legacyGeneratedImage = await this.prisma.generationJob.findFirst({
      where: {
        type: { in: ["TEXT2IMAGE", "IMAGE_EDIT"] },
        outputAssetIds: { array_contains: assetId },
      },
      select: { id: true },
    });
    if (legacyGeneratedImage) throw new ForbiddenException();
  }

  private async getObjectBuffer(key: string) {
    const client = await this.client();
    if (client) {
      try {
        const result = await client.get(key);
        return Buffer.isBuffer(result.content)
          ? result.content
          : Buffer.from(result.content);
      } catch (err) {
        this.logger.error(
          `OSS get failed for ${key}: ${(err as Error).message}`,
        );
        throw new NotFoundException();
      }
    }

    const base = await this.getPublicBaseUrl();
    if (!base) throw new NotFoundException();
    const res = await fetch(`${base}/${key}`);
    if (!res.ok) throw new NotFoundException();
    return Buffer.from(await res.arrayBuffer());
  }
}
