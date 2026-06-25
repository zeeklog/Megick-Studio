import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "nestjs-prisma";

@Injectable()
export class CreditsService {
  constructor(private readonly prisma: PrismaService) {}

  async grant(userId: string, amount: number, reason: string, refType?: string, refId?: string) {
    if (amount <= 0) throw new BadRequestException("amount must be positive");
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.profile.findUnique({ where: { userId } });
      if (!profile) throw new NotFoundException("Profile not found");
      const next = profile.credits + amount;
      await tx.profile.update({ where: { userId }, data: { credits: next } });
      await tx.creditLedger.create({
        data: { userId, delta: amount, balanceAfter: next, reason, refType, refId },
      });
      return next;
    });
  }

  async spend(userId: string, amount: number, reason: string, refType?: string, refId?: string) {
    if (amount <= 0) return 0;
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.profile.findUnique({ where: { userId } });
      if (!profile) throw new NotFoundException("Profile not found");
      if (profile.credits < amount) throw new BadRequestException("INSUFFICIENT_CREDITS");
      const next = profile.credits - amount;
      await tx.profile.update({ where: { userId }, data: { credits: next } });
      await tx.creditLedger.create({
        data: { userId, delta: -amount, balanceAfter: next, reason, refType, refId },
      });
      return next;
    });
  }

  async refund(userId: string, amount: number, reason: string, refType?: string, refId?: string) {
    if (amount <= 0) return 0;
    return this.grant(userId, amount, `REFUND: ${reason}`, refType, refId);
  }

  async grantMonthlyAllowance(
    userId: string,
    allowance: number,
    reason = "Manual credit grant",
    input: string | { refType?: string; refId?: string; idempotencyKey?: string } = {},
  ) {
    if (allowance <= 0) return this.prisma.profile.findUnique({ where: { userId } });
    const ref =
      typeof input === "string"
        ? { refType: "PAYMENT_ORDER", refId: input, idempotencyKey: undefined }
        : {
            refType: input.refType,
            refId: input.refId,
            idempotencyKey: input.idempotencyKey,
          };
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (ref.idempotencyKey) {
          const existingLedger = await tx.creditLedger.findUnique({
            where: { idempotencyKey: ref.idempotencyKey },
          });
          if (existingLedger) return tx.profile.findUnique({ where: { userId } });
        }
        const profile = await tx.profile.findUnique({ where: { userId } });
        if (!profile) throw new NotFoundException("Profile not found");
        const next = profile.credits + allowance;
        const updated = await tx.profile.update({
          where: { userId },
          data: { credits: { increment: allowance } },
        });
        await tx.creditLedger.create({
          data: {
            userId,
            delta: allowance,
            balanceAfter: next,
            reason,
            refType: ref.refType ?? "ADMIN_ADJUSTMENT",
            refId: ref.refId,
            idempotencyKey: ref.idempotencyKey,
          },
        });
        return updated;
      });
    } catch (err) {
      if (ref.idempotencyKey && this.isUniqueConstraintError(err)) {
        return this.prisma.profile.findUnique({ where: { userId } });
      }
      throw err;
    }
  }

  async setMonthlyAllowance(userId: string, allowance: number, reason: string, refId?: string) {
    return this.grantMonthlyAllowance(userId, allowance, reason, refId);
  }

  private isUniqueConstraintError(err: unknown) {
    return (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: unknown }).code === "P2002"
    );
  }
}
