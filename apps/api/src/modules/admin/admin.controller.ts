import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "nestjs-prisma";
import dayjs from "dayjs";
import { Roles } from "@/common/decorators/roles.decorator";
import {
  paginated,
  parsePagination,
  type PaginationQuery,
} from "@/common/pagination";
import {
  AdminAuditLogEntryDto,
  AdminDashboardDto,
  ApiOkPaginatedResponse,
  ApiOkResponseModel,
  ApiPaginationQueries,
  ApiSessionCookieAuth,
  documentedOperation,
} from "@/common/swagger/api-docs";

@ApiTags("admin")
@ApiSessionCookieAuth(
  "Requires a valid `mg_session` cookie for a SUPER_ADMIN account.",
)
@Roles("SUPER_ADMIN")
@Controller("api/admin")
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("dashboard")
  @ApiOperation(
    documentedOperation(
      "Aggregate dashboard stats",
      "Returns high-level open-source edition user, generation, credit, and media aggregates for the admin landing dashboard.",
    ),
  )
  @ApiOkResponseModel(AdminDashboardDto, "Admin dashboard loaded successfully.")
  async dashboard() {
    const now = dayjs();
    const today = now.startOf("day");
    const yesterday = today.subtract(1, "day");
    const since7 = now.subtract(7, "day").toDate();
    const since14 = today.subtract(13, "day").toDate();
    const since30 = now.subtract(30, "day").toDate();
    const since1h = now.subtract(1, "hour").toDate();
    const since24h = now.subtract(24, "hour").toDate();

    const [
      users,
      users30d,
      usersToday,
      usersYesterday,
      jobs30,
      jobsToday,
      jobsYesterday,
      succeededJobs30,
      failedJobs30,
      activeJobs,
      generationStatusRows,
      generationTypeRows,
      activeUsers7d,
      activeUsers30d,
      neverLoggedIn,
      pendingUsers,
      disabledUsers,
      generatingUsers30d,
      chats30d,
      assets30d,
      trendUsers,
      trendJobs,
      trendChats,
      trendAssets,
      totalCreditBalance,
      creditsSpent1h,
      creditsSpent24h,
      creditsSpent7d,
      creditsSpent30d,
      creditsGranted30d,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: since30 } } }),
      this.prisma.user.count({
        where: { createdAt: { gte: today.toDate(), lt: today.add(1, "day").toDate() } },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: yesterday.toDate(), lt: today.toDate() } },
      }),
      this.prisma.generationJob.count({ where: { createdAt: { gte: since30 } } }),
      this.prisma.generationJob.count({
        where: { createdAt: { gte: today.toDate(), lt: today.add(1, "day").toDate() } },
      }),
      this.prisma.generationJob.count({
        where: { createdAt: { gte: yesterday.toDate(), lt: today.toDate() } },
      }),
      this.prisma.generationJob.count({
        where: { status: "succeeded", createdAt: { gte: since30 } },
      }),
      this.prisma.generationJob.count({
        where: { status: "failed", createdAt: { gte: since30 } },
      }),
      this.prisma.generationJob.count({
        where: { status: { in: ["queued", "running"] } },
      }),
      this.prisma.generationJob.groupBy({
        by: ["status"],
        where: { createdAt: { gte: since30 } },
        _count: { _all: true },
      }),
      this.prisma.generationJob.groupBy({
        by: ["type"],
        where: { createdAt: { gte: since30 } },
        _count: { _all: true },
      }),
      this.prisma.user.count({ where: { lastLoginAt: { gte: since7 } } }),
      this.prisma.user.count({ where: { lastLoginAt: { gte: since30 } } }),
      this.prisma.user.count({ where: { lastLoginAt: null } }),
      this.prisma.user.count({ where: { status: "PENDING" } }),
      this.prisma.user.count({ where: { status: "DISABLED" } }),
      this.prisma.generationJob.groupBy({
        by: ["userId"],
        where: { createdAt: { gte: since30 } },
        _count: { _all: true },
      }),
      this.prisma.chatSession.count({ where: { createdAt: { gte: since30 } } }),
      this.prisma.ossAsset.count({ where: { createdAt: { gte: since30 } } }),
      this.prisma.user.findMany({
        where: { createdAt: { gte: since14 } },
        select: { createdAt: true },
      }),
      this.prisma.generationJob.findMany({
        where: { createdAt: { gte: since14 } },
        select: { createdAt: true, status: true, type: true },
      }),
      this.prisma.chatSession.findMany({
        where: { createdAt: { gte: since14 } },
        select: { createdAt: true },
      }),
      this.prisma.ossAsset.findMany({
        where: { createdAt: { gte: since14 } },
        select: { createdAt: true },
      }),
      this.prisma.profile.aggregate({
        _sum: { credits: true },
      }),
      this.prisma.creditLedger.aggregate({
        where: { delta: { lt: 0 }, createdAt: { gte: since1h } },
        _sum: { delta: true },
      }),
      this.prisma.creditLedger.aggregate({
        where: { delta: { lt: 0 }, createdAt: { gte: since24h } },
        _sum: { delta: true },
      }),
      this.prisma.creditLedger.aggregate({
        where: { delta: { lt: 0 }, createdAt: { gte: since7 } },
        _sum: { delta: true },
      }),
      this.prisma.creditLedger.aggregate({
        where: { delta: { lt: 0 }, createdAt: { gte: since30 } },
        _sum: { delta: true },
      }),
      this.prisma.creditLedger.aggregate({
        where: { delta: { gt: 0 }, createdAt: { gte: since30 } },
        _sum: { delta: true },
      }),
    ]);

    type TrendPoint = {
      date: string;
      users: number;
      jobs: number;
      succeededJobs: number;
      failedJobs: number;
      chats: number;
      assets: number;
    };

    const trendSeed = Array.from({ length: 14 }, (_, index): [string, TrendPoint] => {
      const day = dayjs(since14).add(index, "day");
      return [
        day.format("YYYY-MM-DD"),
        {
          date: day.format("YYYY-MM-DD"),
          users: 0,
          jobs: 0,
          succeededJobs: 0,
          failedJobs: 0,
          chats: 0,
          assets: 0,
        },
      ];
    });
    const trendMap = new Map(trendSeed);

    for (const user of trendUsers) {
      const point = trendMap.get(dayjs(user.createdAt).format("YYYY-MM-DD"));
      if (point) point.users += 1;
    }
    for (const job of trendJobs) {
      const point = trendMap.get(dayjs(job.createdAt).format("YYYY-MM-DD"));
      if (point) {
        point.jobs += 1;
        if (job.status === "succeeded") point.succeededJobs += 1;
        if (job.status === "failed") point.failedJobs += 1;
      }
    }
    for (const chat of trendChats) {
      const point = trendMap.get(dayjs(chat.createdAt).format("YYYY-MM-DD"));
      if (point) point.chats += 1;
    }
    for (const asset of trendAssets) {
      const point = trendMap.get(dayjs(asset.createdAt).format("YYYY-MM-DD"));
      if (point) point.assets += 1;
    }

    const generationStatus30d = Object.fromEntries(
      generationStatusRows.map((row) => [row.status, row._count._all]),
    ) as Record<string, number>;
    const generationType30d = Object.fromEntries(
      generationTypeRows.map((row) => [row.type, row._count._all]),
    ) as Record<string, number>;

    return {
      totals: {
        users,
        users30d,
        jobs30d: jobs30,
        succeededJobs30d: succeededJobs30,
        failedJobs30d: failedJobs30,
        activeJobs,
        chats30d,
        assets30d,
      },
      credits: {
        totalBalance: totalCreditBalance._sum.credits ?? 0,
        granted30d: creditsGranted30d._sum.delta ?? 0,
        spent1h: Math.abs(creditsSpent1h._sum.delta ?? 0),
        spent24h: Math.abs(creditsSpent24h._sum.delta ?? 0),
        spent7d: Math.abs(creditsSpent7d._sum.delta ?? 0),
        spent30d: Math.abs(creditsSpent30d._sum.delta ?? 0),
      },
      growth: {
        usersToday,
        usersYesterday,
        jobsToday,
        jobsYesterday,
      },
      userLifecycle: {
        active7d: activeUsers7d,
        active30d: activeUsers30d,
        neverLoggedIn,
        pendingUsers,
        disabledUsers,
      },
      engagement: {
        generatingUsers30d: generatingUsers30d.length,
        chats30d,
        assets30d,
        generationSuccessRate30d:
          jobs30 === 0 ? 0 : Number(((succeededJobs30 / jobs30) * 100).toFixed(2)),
      },
      trends: Array.from(trendMap.values()),
      generationStatus30d,
      generationType30d,
    };
  }

  @Get("audit-log")
  @ApiPaginationQueries({ defaultPageSize: 50, maxPageSize: 200 })
  @ApiOperation(
    documentedOperation(
      "Recent admin audit log",
      "Returns the admin audit stream in reverse chronological order. Use it for operational review, compliance tooling, and change tracing.",
    ),
  )
  @ApiOkPaginatedResponse(
    AdminAuditLogEntryDto,
    "Audit log page loaded successfully.",
  )
  async audit(@Query() query: PaginationQuery) {
    const pagination = parsePagination(query, {
      defaultPageSize: 50,
      maxPageSize: 200,
    });
    const [items, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
        include: { admin: { select: { id: true, email: true } } },
      }),
      this.prisma.adminAuditLog.count(),
    ]);
    return paginated(items, total, pagination);
  }
}
