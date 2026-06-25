import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { PrismaService } from "nestjs-prisma";
import type { Prisma } from "@prisma/client";
import type { Queue } from "bullmq";
import { normalizeLocale } from "@/common/locale";
import {
  ADMIN_CREDIT_NOTIFICATION_JOB,
  ADMIN_CREDIT_NOTIFICATIONS_QUEUE,
  type CreditNotificationJobData,
} from "./users.constants";
import { AdvancedAccessService } from "@/common/services/advanced-access.service";

const AVATAR_CONTENT_TYPES = new Set(["image/png", "image/jpeg"]);
const AVATAR_MAX_SIZE_BYTES = 2 * 1024 * 1024;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly advancedAccess: AdvancedAccessService,
    @InjectQueue(ADMIN_CREDIT_NOTIFICATIONS_QUEUE)
    private readonly creditNotificationQueue: Queue<CreditNotificationJobData>,
  ) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, userRoles: { include: { role: true } } },
    });
    if (!user) throw new NotFoundException();
    return user;
  }

  async updateProfile(userId: string, input: { displayName?: string; locale?: string; avatarUrl?: string }) {
    const data: Prisma.ProfileUpdateInput = {};
    if (input.displayName !== undefined) {
      data.displayName = input.displayName.trim().slice(0, 80);
    }
    if (input.locale !== undefined) {
      data.locale = input.locale.trim() ? normalizeLocale(input.locale) : undefined;
      if (data.locale) {
        data.localeSource = "explicit";
        data.localeUpdatedAt = new Date();
      }
    }
    if (input.avatarUrl !== undefined) {
      data.avatarUrl = await this.normalizeAvatarUrl(userId, input.avatarUrl);
    }
    return this.prisma.profile.update({
      where: { userId },
      data,
    });
  }

  async overview(userId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException();

    const [totalGenerations, succeeded, spentCredits] = await Promise.all([
      this.prisma.generationJob.count({ where: { userId } }),
      this.prisma.generationJob.count({ where: { userId, status: "succeeded" } }),
      this.prisma.creditLedger.aggregate({
        where: { userId, delta: { lt: 0 } },
        _sum: { delta: true },
      }),
    ]);
    const successRate = totalGenerations === 0 ? 0 : Math.round((succeeded / totalGenerations) * 100);

    return {
      credits: profile.credits,
      hasAdvancedAccess: await this.advancedAccess.hasAdvancedAccess(userId),
      totalSpent: Math.abs(spentCredits._sum.delta ?? 0),
      totalGenerations,
      successRate,
    };
  }

  async listAdmin(query: {
    skip?: number;
    take?: number;
    q?: string;
    status?: "ACTIVE" | "DISABLED" | "PENDING";
    creditSort?: "asc" | "desc";
  }) {
    const where: Prisma.UserWhereInput = {};
    const and: Prisma.UserWhereInput[] = [];
    const q = query.q?.trim();
    if (q) {
      and.push({
        OR: [
          { email: { contains: q } },
          { profile: { displayName: { contains: q } } },
        ],
      });
    }
    if (query.status) {
      where.status = query.status;
    }
    if (and.length) {
      where.AND = and;
    }

    const orderBy: Prisma.UserOrderByWithRelationInput[] = query.creditSort
      ? [
          { profile: { credits: query.creditSort } },
          { createdAt: "desc" },
          { id: "desc" },
        ]
      : [{ createdAt: "desc" }, { id: "desc" }];

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: query.skip ?? 0,
        take: Math.min(query.take ?? 50, 200),
        orderBy,
        include: {
          profile: true,
          userRoles: { include: { role: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total };
  }

  async adminDashboard(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        userRoles: { include: { role: true } },
      },
    });
    if (!user || !user.profile) throw new NotFoundException();

    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [
      totalGenerations,
      generationStatusRows,
      generationTypeRows,
      generations30d,
      recentJobs,
      grantedCredits,
      spentCredits,
      ledgerCount,
      recentLedger,
      chatSessions,
      assets,
    ] = await Promise.all([
      this.prisma.generationJob.count({ where: { userId } }),
      this.prisma.generationJob.groupBy({
        by: ["status"],
        where: { userId },
        _count: { _all: true },
      }),
      this.prisma.generationJob.groupBy({
        by: ["type"],
        where: { userId },
        _count: { _all: true },
      }),
      this.prisma.generationJob.count({ where: { userId, createdAt: { gte: since30 } } }),
      this.prisma.generationJob.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 8,
        select: {
          id: true,
          type: true,
          status: true,
          modelCode: true,
          prompt: true,
          costCredits: true,
          createdAt: true,
          finishedAt: true,
        },
      }),
      this.prisma.creditLedger.aggregate({
        where: { userId, delta: { gt: 0 } },
        _sum: { delta: true },
      }),
      this.prisma.creditLedger.aggregate({
        where: { userId, delta: { lt: 0 } },
        _sum: { delta: true },
      }),
      this.prisma.creditLedger.count({ where: { userId } }),
      this.prisma.creditLedger.findMany({
        where: { userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 8,
        select: {
          id: true,
          delta: true,
          balanceAfter: true,
          reason: true,
          refType: true,
          refId: true,
          createdAt: true,
        },
      }),
      this.prisma.chatSession.count({ where: { userId } }),
      this.prisma.ossAsset.count({ where: { userId } }),
    ]);

    const countByStatus = Object.fromEntries(
      generationStatusRows.map((row) => [row.status, row._count._all]),
    ) as Record<string, number>;
    const countByType = Object.fromEntries(
      generationTypeRows.map((row) => [row.type, row._count._all]),
    ) as Record<string, number>;
    const succeeded = countByStatus.succeeded ?? 0;

    return {
      user: {
        id: user.id,
        email: user.email,
        status: user.status,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        roles: user.userRoles.map((role) => role.role.code),
        profile: {
          displayName: user.profile.displayName,
          avatarUrl: user.profile.avatarUrl,
          locale: user.profile.locale,
          localeSource: user.profile.localeSource,
          credits: user.profile.credits,
        },
      },
      overview: {
        credits: user.profile.credits,
        totalSpent: Math.abs(spentCredits._sum.delta ?? 0),
        totalGenerations,
        successRate: totalGenerations === 0 ? 0 : Math.round((succeeded / totalGenerations) * 100),
      },
      credits: {
        balance: user.profile.credits,
        ledgerEntries: ledgerCount,
        totalGranted: grantedCredits._sum.delta ?? 0,
        totalSpent: Math.abs(spentCredits._sum.delta ?? 0),
        recentLedger,
      },
      generations: {
        total: totalGenerations,
        last30d: generations30d,
        succeeded,
        failed: countByStatus.failed ?? 0,
        running: countByStatus.running ?? 0,
        queued: countByStatus.queued ?? 0,
        canceled: countByStatus.canceled ?? 0,
        textToImage: (countByType.TEXT2IMAGE ?? 0) + (countByType.IMAGE_EDIT ?? 0),
        imageToVideo: countByType.IMAGE2VIDEO ?? 0,
        successRate: totalGenerations === 0 ? 0 : Math.round((succeeded / totalGenerations) * 100),
        recentJobs,
      },
      activity: {
        chatSessions,
        assets,
      },
    };
  }

  async setStatus(userId: string, status: "ACTIVE" | "DISABLED" | "PENDING") {
    return this.prisma.user.update({ where: { id: userId }, data: { status } });
  }

  async adjustCredits(
    userId: string,
    delta: number,
    reason: string,
    adminId: string,
    notifyUser = false,
  ) {
    const normalized = this.normalizeCreditAdjustment(delta, reason);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        profile: { select: { credits: true, displayName: true, locale: true } },
      },
    });
    if (!user?.profile) throw new NotFoundException();

    const next = Math.max(0, user.profile.credits + normalized.delta);
    await this.prisma.$transaction([
      this.prisma.profile.update({ where: { userId }, data: { credits: next } }),
      this.prisma.creditLedger.create({
        data: {
          userId,
          delta: normalized.delta,
          balanceAfter: next,
          reason: normalized.reason,
          refType: "ADMIN_ADJUSTMENT",
          refId: adminId,
        },
      }),
    ]);

    if (notifyUser) {
      await this.enqueueCreditNotifications([
        {
          userId: user.id,
          email: user.email,
          displayName: user.profile.displayName || user.email.split("@")[0],
          delta: normalized.delta,
          balanceAfter: next,
          reason: normalized.reason,
          locale: user.profile.locale,
        },
      ]);
    }

    return { credits: next, notificationQueued: notifyUser };
  }

  async adjustCreditsMany(
    userIds: string[],
    delta: number,
    reason: string,
    adminId: string,
    notifyUsers = false,
  ) {
    const normalized = this.normalizeCreditAdjustment(delta, reason);
    const ids = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) throw new BadRequestException("Select at least one user");
    if (ids.length > 200) throw new BadRequestException("Batch credit adjustment is limited to 200 users");

    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        email: true,
        profile: { select: { credits: true, displayName: true, locale: true } },
      },
    });
    const usersById = new Map(users.map((user) => [user.id, user]));
    const missingUser = ids.find((id) => !usersById.get(id)?.profile);
    if (missingUser) throw new NotFoundException(`User not found: ${missingUser}`);

    const adjustments = ids.map((id) => {
      const user = usersById.get(id);
      if (!user?.profile) throw new NotFoundException(`User not found: ${id}`);
      const balanceAfter = Math.max(0, user.profile.credits + normalized.delta);
      return {
        user,
        balanceAfter,
      };
    });

    await this.prisma.$transaction(
      adjustments.flatMap(({ user, balanceAfter }) => [
        this.prisma.profile.update({
          where: { userId: user.id },
          data: { credits: balanceAfter },
        }),
        this.prisma.creditLedger.create({
          data: {
            userId: user.id,
            delta: normalized.delta,
            balanceAfter,
            reason: normalized.reason,
            refType: "ADMIN_ADJUSTMENT",
            refId: adminId,
          },
        }),
      ]),
    );

    if (notifyUsers) {
      await this.enqueueCreditNotifications(
        adjustments.map(({ user, balanceAfter }) => ({
          userId: user.id,
          email: user.email,
          displayName: user.profile?.displayName || user.email.split("@")[0],
          delta: normalized.delta,
          balanceAfter,
          reason: normalized.reason,
          locale: user.profile?.locale ?? undefined,
        })),
      );
    }

    return {
      adjusted: adjustments.length,
      notificationQueued: notifyUsers,
      notificationCount: notifyUsers ? adjustments.length : 0,
    };
  }

  private normalizeCreditAdjustment(delta: number, reason: string) {
    if (!Number.isInteger(delta) || delta === 0) {
      throw new BadRequestException("Credit delta must be a non-zero integer");
    }
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      throw new BadRequestException("Credit adjustment reason is required");
    }
    return { delta, reason: normalizedReason };
  }

  private async enqueueCreditNotifications(items: CreditNotificationJobData[]) {
    if (!items.length) return;
    await this.creditNotificationQueue.addBulk(
      items.map((item) => ({
        name: ADMIN_CREDIT_NOTIFICATION_JOB,
        data: item,
        opts: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5_000 },
          removeOnComplete: { age: 7 * 24 * 3600, count: 1_000 },
          removeOnFail: { age: 30 * 24 * 3600, count: 5_000 },
        },
      })),
    );
  }

  private async normalizeAvatarUrl(userId: string, value: string) {
    const raw = value.trim();
    if (!raw) return null;

    const key = this.avatarKeyFromInput(raw);
    if (!key || !key.startsWith(`avatars/${userId}/`)) {
      throw new BadRequestException("INVALID_AVATAR_ASSET");
    }

    const asset = await this.prisma.ossAsset.findUnique({ where: { key } });
    if (!asset || asset.userId !== userId) {
      throw new BadRequestException("INVALID_AVATAR_ASSET");
    }
    if (!AVATAR_CONTENT_TYPES.has(asset.contentType.toLowerCase())) {
      throw new BadRequestException("INVALID_AVATAR_TYPE");
    }
    if (asset.sizeBytes > AVATAR_MAX_SIZE_BYTES) {
      throw new BadRequestException("AVATAR_TOO_LARGE");
    }

    return `/api/oss/sign?key=${encodeURIComponent(key)}`;
  }

  private avatarKeyFromInput(value: string) {
    const normalize = (key: string | null | undefined) => {
      const normalized = key?.trim().replace(/^\/+/, "").split("?")[0];
      if (!normalized || normalized.includes("..")) return null;
      return normalized.startsWith("avatars/") ? normalized : null;
    };

    try {
      const url = value.startsWith("/")
        ? new URL(value, "http://local")
        : /^https?:\/\//i.test(value)
          ? new URL(value)
          : null;
      if (url) {
        if (url.pathname === "/api/oss/sign" || url.pathname === "/api/oss/assets/content") {
          return normalize(url.searchParams.get("key"));
        }
        return normalize(decodeURIComponent(url.pathname.replace(/^\/+/, "")));
      }
    } catch {
      return null;
    }

    return normalize(value);
  }
}
