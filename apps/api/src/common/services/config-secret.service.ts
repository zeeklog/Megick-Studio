import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "nestjs-prisma";
import { CryptoService } from "./crypto.service";
import type { OAuthProviderConfig, OAuthProviderEnum } from "@prisma/client";

/**
 * Centralised access to admin-managed secrets.
 *
 * Falls back to `.env` if the corresponding row in the DB is missing or
 * marked inactive, so the very first deploy still works before an
 * administrator finishes filling in the panel.
 */
@Injectable()
export class ConfigSecretService {
  private readonly logger = new Logger(ConfigSecretService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly crypto: CryptoService,
  ) {}

  // ----- OAuth -----

  async getOAuthConfig(
    provider: OAuthProviderEnum,
  ): Promise<{
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scopes: string[];
    extra: Record<string, unknown>;
  }> {
    let row: OAuthProviderConfig | null = null;
    try {
      row = await this.prisma.oAuthProviderConfig.findUnique({
        where: { provider },
      });
    } catch (err) {
      this.logger.warn(
        `Could not query OAuthProviderConfig: ${(err as Error).message}`,
      );
    }
    const fallback = this.envOAuthFallback(provider);

    if (!row || !row.isActive) {
      return fallback;
    }
    return {
      clientId: row.clientId || fallback.clientId,
      clientSecret:
        this.crypto.decrypt(row.clientSecretEnc) || fallback.clientSecret,
      redirectUri: this.resolveOAuthRedirectUri(
        row.redirectUri,
        fallback.redirectUri,
      ),
      scopes: Array.isArray(row.scopes)
        ? (row.scopes as string[])
        : fallback.scopes,
      extra: {
        ...fallback.extra,
        ...((row.extra as Record<string, unknown> | null) ?? {}),
      },
    };
  }

  private envOAuthFallback(provider: OAuthProviderEnum) {
    const apiBase = this.config.get<string>(
      "API_BASE_URL",
      "http://localhost:3333",
    );
    if (provider === "GOOGLE") {
      return {
        clientId: this.config.get<string>("GOOGLE_CLIENT_ID", ""),
        clientSecret: this.config.get<string>("GOOGLE_CLIENT_SECRET", ""),
        redirectUri: `${apiBase}/api/auth/google/callback`,
        scopes: ["openid", "email", "profile"],
        extra: {},
      };
    }
    if (provider === "GITHUB") {
      return {
        clientId: this.config.get<string>("GITHUB_CLIENT_ID", ""),
        clientSecret: this.config.get<string>("GITHUB_CLIENT_SECRET", ""),
        redirectUri: `${apiBase}/api/auth/github/callback`,
        scopes: ["read:user", "user:email"],
        extra: {},
      };
    }
    return {
      clientId:
        this.config.get<string>("APPLE_SERVICE_ID", "") ||
        this.config.get<string>("APPLE_CLIENT_ID", ""),
      clientSecret: this.config.get<string>("APPLE_CLIENT_SECRET", ""),
      redirectUri: `${apiBase}/api/auth/apple/callback`,
      scopes: ["name", "email"],
      extra: {
        teamId: this.config.get<string>("APPLE_TEAM_ID", ""),
        keyId: this.config.get<string>("APPLE_KEY_ID", ""),
        privateKey: this.config.get<string>("APPLE_PRIVATE_KEY", ""),
        bundleId: this.config.get<string>("APPLE_BUNDLE_ID", ""),
        serviceId:
          this.config.get<string>("APPLE_SERVICE_ID", "") ||
          this.config.get<string>("APPLE_CLIENT_ID", ""),
        nativeClientIds: this.csvEnv("APPLE_NATIVE_CLIENT_IDS"),
        bundleIds: this.csvEnv("APPLE_BUNDLE_IDS"),
      },
    };
  }

  private csvEnv(key: string) {
    return this.config
      .get<string>(key, "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private resolveOAuthRedirectUri(
    redirectUri: string | null | undefined,
    fallback: string,
  ) {
    const value = redirectUri?.trim();
    if (!value) return fallback;

    try {
      return new URL(value).toString();
    } catch {
      if (value.startsWith("/")) {
        const apiBase = this.config.get<string>(
          "API_BASE_URL",
          "http://localhost:3333",
        );
        return new URL(value, apiBase).toString();
      }
      this.logger.warn(
        `Invalid OAuth redirect URI "${value}", falling back to ${fallback}`,
      );
      return fallback;
    }
  }

}
