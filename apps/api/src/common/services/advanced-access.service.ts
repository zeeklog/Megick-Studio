import { Injectable } from "@nestjs/common";
import { PrismaService } from "nestjs-prisma";

export interface AdvancedAccessSummary {
  hasAdvancedAccess: boolean;
  advancedAccessSince: Date | null;
}

@Injectable()
export class AdvancedAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummaries(userIds: string[]): Promise<Map<string, AdvancedAccessSummary>> {
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    const roleRows = await this.prisma.userRole.findMany({
      where: {
        userId: { in: uniqueIds },
        role: { code: "SUPER_ADMIN" },
      },
      select: { userId: true, createdAt: true },
    });
    const grantedAtByUser = new Map(roleRows.map((row) => [row.userId, row.createdAt]));

    return new Map(
      uniqueIds.map((userId) => {
        const advancedAccessSince = grantedAtByUser.get(userId) ?? null;
        return [
          userId,
          {
            hasAdvancedAccess: Boolean(advancedAccessSince),
            advancedAccessSince,
          },
        ];
      }),
    );
  }

  async getSummary(userId: string): Promise<AdvancedAccessSummary> {
    return (await this.getSummaries([userId])).get(userId) ?? {
      hasAdvancedAccess: false,
      advancedAccessSince: null,
    };
  }

  async hasAdvancedAccess(userId: string) {
    return (await this.getSummary(userId)).hasAdvancedAccess;
  }
}
