import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "nestjs-prisma";
import type { OAuthProviderEnum } from "@prisma/client";
import { CryptoService } from "@/common/services/crypto.service";
import { RedisService } from "@/common/services/redis.service";
import { randomId } from "@/common/random-id";
import {
  AUTH_DEFAULT_REGISTRATION_CREDITS_KEY,
  readDefaultRegistrationCredits,
} from "@/modules/site-settings/site-settings.service";
import { DEFAULT_LOCALE, normalizeLocale, type AppLocale } from "@/common/locale";

export interface OAuthProfile {
  provider: OAuthProviderEnum;
  providerUserId: string;
  email?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  raw: Record<string, unknown>;
  locale?: AppLocale;
  localeSource?: "device" | "explicit";
}

export interface OAuthStateContext {
  provider: OAuthProviderEnum;
  redirectTo?: string;
  codeVerifier?: string;
  locale?: AppLocale;
  localeSource?: "device" | "explicit";
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly redis: RedisService,
  ) {}

  // ---------- CSRF state ----------

  async issueState(
    provider: OAuthProviderEnum,
    redirectTo?: string,
    extra?: {
      codeVerifier?: string;
      locale?: AppLocale;
      localeSource?: "device" | "explicit";
    },
  ): Promise<string> {
    const state = randomId(32);
    const payload: OAuthStateContext = {
      provider,
      redirectTo,
      codeVerifier: extra?.codeVerifier,
      locale: extra?.locale,
      localeSource: extra?.localeSource,
    };
    await this.redis.client.set(
      this.stateKey(state),
      JSON.stringify(payload),
      "EX",
      300,
    );
    return state;
  }

  async consumeState(state: string): Promise<OAuthStateContext | null> {
    const key = this.stateKey(state);
    const value = await this.redis.client.getdel(key);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<OAuthStateContext>;
    if (!parsed.provider) return null;
    return {
      provider: parsed.provider,
      redirectTo:
        typeof parsed.redirectTo === "string" ? parsed.redirectTo : undefined,
      codeVerifier:
        typeof parsed.codeVerifier === "string"
          ? parsed.codeVerifier
          : undefined,
      locale: typeof parsed.locale === "string" ? normalizeLocale(parsed.locale) : undefined,
      localeSource: parsed.localeSource === "explicit" ? "explicit" : "device",
    };
  }

  private stateKey(state: string) {
    return `mg:oauth:state:${state}`;
  }

  // ---------- Account linking ----------

  async upsertFromProfile(profile: OAuthProfile) {
    const existing = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: profile.provider,
          providerUserId: profile.providerUserId,
        },
      },
    });

    if (existing) {
      if (profile.email) {
        await this.syncCanonicalEmail(existing.userId, profile.email);
      }
      await this.prisma.oAuthAccount.update({
        where: { id: existing.id },
        data: {
          email: profile.email ?? existing.email,
          displayName: profile.displayName ?? existing.displayName,
          avatarUrl: profile.avatarUrl ?? existing.avatarUrl,
          accessTokenEnc: profile.accessToken
            ? this.crypto.encrypt(profile.accessToken)
            : existing.accessTokenEnc,
          refreshTokenEnc: profile.refreshToken
            ? this.crypto.encrypt(profile.refreshToken)
            : existing.refreshTokenEnc,
          expiresAt: profile.expiresAt ?? existing.expiresAt,
          raw: profile.raw as object,
        },
      });
      return existing.userId;
    }

    // Try to merge by email
    let userId: string | null = null;
    if (profile.email) {
      const userByEmail = await this.prisma.user.findUnique({
        where: { email: profile.email },
      });
      if (userByEmail) userId = userByEmail.id;
    }

    if (!userId) {
      const userRole = await this.prisma.role.findUnique({
        where: { code: "USER" },
      });
      const signupCredits = await this.defaultRegistrationCredits();
      const locale = profile.locale ?? DEFAULT_LOCALE;
      const created = await this.prisma.$transaction(async (tx) => {
        const email =
          profile.email ??
          `${profile.provider.toLowerCase()}-${profile.providerUserId}@megick.local`;
        const user = await tx.user.create({
          data: {
            email,
            profile: {
              create: {
                displayName:
                  profile.displayName ||
                  profile.email?.split("@")[0] ||
                  "Creator",
                avatarUrl: profile.avatarUrl ?? undefined,
                locale,
                localeSource: profile.localeSource ?? "device",
                localeUpdatedAt: profile.localeSource === "explicit" ? new Date() : undefined,
                credits: signupCredits,
              },
            },
            userRoles: userRole
              ? { create: [{ roleId: userRole.id }] }
              : undefined,
          },
        });
        if (signupCredits > 0) {
          await tx.creditLedger.create({
            data: {
              userId: user.id,
              delta: signupCredits,
              balanceAfter: signupCredits,
              reason: "Registration bonus",
              refType: "SIGNUP",
            },
          });
        }
        return user;
      });
      userId = created.id;
    }

    await this.prisma.oAuthAccount.create({
      data: {
        userId,
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        email: profile.email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        accessTokenEnc: profile.accessToken
          ? this.crypto.encrypt(profile.accessToken)
          : null,
        refreshTokenEnc: profile.refreshToken
          ? this.crypto.encrypt(profile.refreshToken)
          : null,
        expiresAt: profile.expiresAt,
        raw: profile.raw as object,
      },
    });

    return userId;
  }

  private async syncCanonicalEmail(userId: string, email: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (
      !user ||
      user.email === email ||
      !user.email.endsWith("@megick.local")
    ) {
      return;
    }

    const occupied = await this.prisma.user.findUnique({ where: { email } });
    if (occupied && occupied.id !== userId) {
      return;
    }

    await this.prisma.user.update({ where: { id: userId }, data: { email } });
  }

  private async defaultRegistrationCredits() {
    const setting = await this.prisma.siteSetting
      .findUnique({ where: { key: AUTH_DEFAULT_REGISTRATION_CREDITS_KEY } })
      .catch(() => null);
    if (!setting) return 0;
    return readDefaultRegistrationCredits(setting.value) ?? 0;
  }
}
