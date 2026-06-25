import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DesktopPlatform, Prisma } from "@prisma/client";
import { PrismaService } from "nestjs-prisma";
import semver from "semver";
import { CloudR2Service } from "../cloud-resources/cloud-r2.service";
import type {
  CreateDesktopReleaseDto,
  DesktopPlatformValue,
  UpdateDesktopReleaseDto,
} from "./desktop-updates.dto";

@Injectable()
export class DesktopReleasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: CloudR2Service,
    private readonly config: ConfigService,
  ) {}

  async list(platform?: DesktopPlatformValue) {
    const rows = await this.prisma.desktopRelease.findMany({
      where: platform ? { platform: platform as DesktopPlatform } : undefined,
      orderBy: [{ platform: "asc" }, { isLatest: "desc" }, { createdAt: "desc" }],
    });
    return rows.map((row) => this.serialize(row));
  }

  async create(input: CreateDesktopReleaseDto) {
    const row = await this.prisma.desktopRelease.create({
      data: {
        platform: input.platform as DesktopPlatform,
        version: input.version,
        downloadUrl: this.releaseDownloadUrl(input.platform, input.downloadUrl, input.r2ObjectKey),
        r2ObjectKey: input.r2ObjectKey?.trim() || null,
        fileName: input.fileName?.trim() || null,
        fileSizeBytes: input.fileSizeBytes == null ? null : BigInt(input.fileSizeBytes),
        sha256: input.sha256?.trim() || null,
        sha512: input.sha512?.trim() || null,
        releaseNotes: input.releaseNotes ?? null,
        forceUpdate: input.forceUpdate ?? true,
        isActive: input.isActive ?? true,
        publishedAt: input.isActive === false ? null : new Date(),
      },
    });

    if (input.isLatest) return this.setLatest(row.id);
    return this.serialize(row);
  }

  async update(id: string, input: UpdateDesktopReleaseDto) {
    const existing = await this.prisma.desktopRelease.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Desktop release not found");

    const platform = input.platform ?? existing.platform;
    const r2ObjectKey = input.r2ObjectKey === undefined ? existing.r2ObjectKey : input.r2ObjectKey;
    const row = await this.prisma.desktopRelease.update({
      where: { id },
      data: {
        platform: input.platform as DesktopPlatform | undefined,
        version: input.version,
        downloadUrl:
          input.downloadUrl === undefined && input.r2ObjectKey === undefined && input.platform === undefined
            ? undefined
            : this.releaseDownloadUrl(platform, input.downloadUrl, r2ObjectKey),
        r2ObjectKey: input.r2ObjectKey === undefined ? undefined : input.r2ObjectKey?.trim() || null,
        fileName: input.fileName === undefined ? undefined : input.fileName?.trim() || null,
        fileSizeBytes: input.fileSizeBytes === undefined ? undefined : input.fileSizeBytes === null ? null : BigInt(input.fileSizeBytes),
        sha256: input.sha256 === undefined ? undefined : input.sha256?.trim() || null,
        sha512: input.sha512 === undefined ? undefined : input.sha512?.trim() || null,
        releaseNotes: input.releaseNotes,
        forceUpdate: input.forceUpdate,
        isActive: input.isActive,
        publishedAt: input.isActive === false ? null : undefined,
      },
    });
    return this.serialize(row);
  }

  async remove(id: string) {
    await this.prisma.desktopRelease.delete({ where: { id } });
    return { ok: true };
  }

  async setLatest(id: string) {
    const existing = await this.prisma.desktopRelease.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Desktop release not found");

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.desktopRelease.updateMany({
        where: { platform: existing.platform },
        data: { isLatest: false },
      });
      return tx.desktopRelease.update({
        where: { id },
        data: {
          isLatest: true,
          isActive: true,
          publishedAt: existing.publishedAt ?? new Date(),
        },
      });
    });
    return this.serialize(row);
  }

  async download(platform: DesktopPlatformValue) {
    const row = await this.latestRow(platform);
    if (row.r2ObjectKey && (!this.isPublicUrl(row.downloadUrl) || row.downloadUrl.includes("/api/desktop-updates/download"))) {
      const signedUrl = await this.r2.signedDownloadUrl(row.r2ObjectKey);
      return { url: signedUrl };
    }
    return { url: row.downloadUrl };
  }

  async latest(platform: DesktopPlatformValue) {
    const latest = await this.prisma.desktopRelease.findFirst({
      where: { platform: platform as DesktopPlatform, isLatest: true, isActive: true },
      orderBy: { updatedAt: "desc" },
    });
    return latest ? this.serializeLatest(latest) : null;
  }

  async check(platform: DesktopPlatformValue, currentVersion: string) {
    const latest = await this.prisma.desktopRelease.findFirst({
      where: { platform: platform as DesktopPlatform, isLatest: true, isActive: true },
      orderBy: { updatedAt: "desc" },
    });
    if (!latest) {
      return { updateAvailable: false, currentVersion, latest: null };
    }

    return {
      updateAvailable: this.isGreater(latest.version, currentVersion),
      currentVersion,
      latest: this.serializeLatest(latest),
    };
  }

  private async latestRow(platform: DesktopPlatformValue) {
    const row = await this.prisma.desktopRelease.findFirst({
      where: { platform: platform as DesktopPlatform, isLatest: true, isActive: true },
      orderBy: { updatedAt: "desc" },
    });
    if (!row) throw new NotFoundException("No desktop release configured for this platform");
    return row;
  }

  private releaseDownloadUrl(platform: DesktopPlatformValue | DesktopPlatform, downloadUrl?: string | null, r2ObjectKey?: string | null) {
    const cleanUrl = downloadUrl?.trim();
    if (cleanUrl) return cleanUrl;
    if (r2ObjectKey?.trim()) return `/api/desktop-updates/download?platform=${platform}`;
    throw new BadRequestException("Installer upload or download URL is required");
  }

  private isPublicUrl(value: string) {
    try {
      const url = new URL(value);
      const apiBase = this.config.get<string>("API_BASE_URL");
      const appBase = this.config.get<string>("APP_BASE_URL");
      const webBase = this.config.get<string>("WEB_BASE_URL");
      const internalHosts = [apiBase, appBase, webBase]
        .filter((item): item is string => Boolean(item))
        .flatMap((item) => {
          try {
            return [new URL(item).host];
          } catch {
            return [];
          }
        });
      return !internalHosts.includes(url.host);
    } catch {
      return false;
    }
  }

  private isGreater(latest: string, current: string) {
    const normalizedLatest = semver.valid(latest);
    const normalizedCurrent = semver.valid(current);
    if (!normalizedLatest || !normalizedCurrent) return false;
    return semver.gt(normalizedLatest, normalizedCurrent);
  }

  private serialize(row: Prisma.DesktopReleaseGetPayload<Record<string, never>>) {
    return {
      id: row.id,
      platform: row.platform,
      version: row.version,
      downloadUrl: row.downloadUrl,
      r2ObjectKey: row.r2ObjectKey,
      fileName: row.fileName,
      fileSizeBytes: row.fileSizeBytes?.toString() ?? null,
      sha256: row.sha256,
      sha512: row.sha512,
      releaseNotes: row.releaseNotes,
      isLatest: row.isLatest,
      forceUpdate: row.forceUpdate,
      isActive: row.isActive,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private serializeLatest(row: Prisma.DesktopReleaseGetPayload<Record<string, never>>) {
    return {
      platform: row.platform,
      version: row.version,
      downloadUrl: `/api/desktop-updates/download?platform=${row.platform}`,
      sourceUrl: row.downloadUrl,
      fileName: row.fileName,
      fileSizeBytes: row.fileSizeBytes?.toString() ?? null,
      sha256: row.sha256,
      releaseNotes: row.releaseNotes,
      forceUpdate: row.forceUpdate,
      publishedAt: row.publishedAt?.toISOString() ?? null,
    };
  }
}
