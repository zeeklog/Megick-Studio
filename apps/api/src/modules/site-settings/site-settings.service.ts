import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "nestjs-prisma";

export const AUTH_DEFAULT_REGISTRATION_CREDITS_KEY = "auth.defaultRegistrationCredits";
export const AUTH_SETTINGS_SCOPE = "auth";
export const SEEDED_DEFAULT_REGISTRATION_CREDITS = 80;
export const FEATURE_VIDEO_GENERATION_ENABLED_KEY = "features.videoGenerationEnabled";
export const FEATURE_SETTINGS_SCOPE = "features";

export function readDefaultRegistrationCredits(value: unknown) {
  const candidate =
    typeof value === "number" || typeof value === "string"
      ? value
      : value && typeof value === "object" && "credits" in value
        ? (value as { credits?: unknown }).credits
        : value && typeof value === "object" && "defaultCredits" in value
          ? (value as { defaultCredits?: unknown }).defaultCredits
          : undefined;
  const parsed = Number(candidate);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

@Injectable()
export class SiteSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  list(scope?: string) {
    return this.prisma.siteSetting.findMany({
      where: scope ? { scope } : undefined,
      orderBy: { key: "asc" },
    });
  }

  byKey(key: string) {
    return this.prisma.siteSetting.findUnique({ where: { key } });
  }

  async defaultRegistrationCredits() {
    const row = await this.byKey(AUTH_DEFAULT_REGISTRATION_CREDITS_KEY);
    if (!row) return 0;
    return readDefaultRegistrationCredits(row.value) ?? 0;
  }

  async isVideoGenerationEnabled() {
    const row = await this.byKey(FEATURE_VIDEO_GENERATION_ENABLED_KEY);
    return this.readBoolean(row?.value);
  }

  async upsert(key: string, value: unknown, scope?: string) {
    if (key === AUTH_DEFAULT_REGISTRATION_CREDITS_KEY) {
      const credits = readDefaultRegistrationCredits(value);
      if (credits == null) {
        throw new BadRequestException("Default registration credits must be a non-negative integer");
      }
      return this.prisma.siteSetting.upsert({
        where: { key },
        update: { value: credits, scope: scope ?? AUTH_SETTINGS_SCOPE },
        create: { key, value: credits, scope: scope ?? AUTH_SETTINGS_SCOPE },
      });
    }

    if (key === FEATURE_VIDEO_GENERATION_ENABLED_KEY) {
      const enabled = this.readBoolean(value);
      return this.prisma.siteSetting.upsert({
        where: { key },
        update: { value: enabled, scope: scope ?? FEATURE_SETTINGS_SCOPE },
        create: { key, value: enabled, scope: scope ?? FEATURE_SETTINGS_SCOPE },
      });
    }

    return this.prisma.siteSetting.upsert({
      where: { key },
      update: { value: this.asJson(value), scope },
      create: { key, value: this.asJson(value), scope },
    });
  }

  delete(key: string) {
    return this.prisma.siteSetting.delete({ where: { key } });
  }

  private readBoolean(value: unknown) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value.toLowerCase() === "true";
    if (value && typeof value === "object" && "enabled" in value) {
      return (value as { enabled?: unknown }).enabled === true;
    }
    return false;
  }

  private asJson(value: unknown) {
    return value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
  }
}
