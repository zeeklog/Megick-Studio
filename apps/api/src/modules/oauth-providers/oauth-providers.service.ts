import { Injectable } from "@nestjs/common";
import { PrismaService } from "nestjs-prisma";
import { CryptoService } from "@/common/services/crypto.service";
import type { OAuthProviderEnum, Prisma } from "@prisma/client";

interface UpsertInput {
  provider: OAuthProviderEnum;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes?: string[];
  extra?: Record<string, unknown>;
  isActive?: boolean;
}

@Injectable()
export class OAuthProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  list() {
    return this.prisma.oAuthProviderConfig.findMany({ orderBy: { provider: "asc" } });
  }

  async safeList() {
    const rows = await this.list();
    return rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      clientId: r.clientId,
      redirectUri: r.redirectUri,
      scopes: r.scopes,
      extra: r.extra,
      isActive: r.isActive,
      hasSecret: !!r.clientSecretEnc,
    }));
  }

  upsert(input: UpsertInput) {
    const enc = input.clientSecret !== undefined ? this.crypto.encrypt(input.clientSecret) : undefined;
    return this.prisma.oAuthProviderConfig.upsert({
      where: { provider: input.provider },
      update: {
        clientId: input.clientId,
        redirectUri: input.redirectUri,
        scopes: (input.scopes ?? []) as Prisma.InputJsonValue,
        extra: (input.extra ?? {}) as Prisma.InputJsonValue,
        isActive: input.isActive ?? true,
        ...(enc !== undefined ? { clientSecretEnc: enc } : {}),
      },
      create: {
        provider: input.provider,
        clientId: input.clientId,
        clientSecretEnc: enc ?? this.crypto.encrypt(""),
        redirectUri: input.redirectUri,
        scopes: (input.scopes ?? []) as Prisma.InputJsonValue,
        extra: (input.extra ?? {}) as Prisma.InputJsonValue,
        isActive: input.isActive ?? true,
      },
    });
  }
}
