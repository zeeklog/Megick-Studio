import { Injectable } from "@nestjs/common";
import { PrismaService } from "nestjs-prisma";
import type { AdminAction } from "@prisma/client";

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  log(input: {
    adminId?: string | null;
    action: AdminAction;
    targetType: string;
    targetId?: string;
    before?: unknown;
    after?: unknown;
    ip?: string;
    userAgent?: string;
  }) {
    return this.prisma.adminAuditLog.create({
      data: {
        adminId: input.adminId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        before: input.before as object,
        after: input.after as object,
        ip: input.ip,
        userAgent: input.userAgent,
      },
    });
  }
}
