import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "nestjs-prisma";
import { Request } from "express";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { SessionService } from "../services/session.service";
import type { AuthUserContext } from "../decorators/current-user.decorator";
import { localeFromAcceptLanguage, localizedText, type AppLocale } from "../locale";

const authGuardMessages = {
  "zh-CN": {
    authenticationRequired: "请先登录",
    insufficientPermissions: "权限不足",
  },
  "zh-TW": {
    authenticationRequired: "請先登入",
    insufficientPermissions: "權限不足",
  },
  en: {
    authenticationRequired: "Authentication required",
    insufficientPermissions: "Insufficient permissions",
  },
  ja: {
    authenticationRequired: "ログインしてください",
    insufficientPermissions: "権限がありません",
  },
  fr: {
    authenticationRequired: "Authentification requise",
    insufficientPermissions: "Autorisations insuffisantes",
  },
  de: {
    authenticationRequired: "Anmeldung erforderlich",
    insufficientPermissions: "Nicht ausreichende Berechtigungen",
  },
};

function authGuardText(locale: AppLocale | undefined, key: keyof typeof authGuardMessages.en) {
  return localizedText(authGuardMessages, locale, key);
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUserContext }>();
    const cookieKey = this.sessions.cookieKey();
    const cookies = (req.cookies ?? {}) as Record<string, string>;
    const token = cookies[cookieKey];

    if (token) {
      const payload = await this.sessions.verify(token);
      if (payload) {
        const userRoles = await this.prisma.userRole.findMany({
          where: { userId: payload.userId },
          include: { role: true },
        });
        const user = await this.prisma.user.findUnique({
          where: { id: payload.userId },
          select: { id: true, email: true, status: true },
        });
        if (user && user.status === "ACTIVE") {
          req.user = {
            id: user.id,
            email: user.email,
            isSuperAdmin: payload.isSuperAdmin || userRoles.some((r) => r.role.code === "SUPER_ADMIN"),
            roles: userRoles.map((r) => r.role.code),
          };
        }
      }
    }

    if (isPublic) return true;

    const locale = localeFromAcceptLanguage(req.get("accept-language"));

    if (!req.user) {
      throw new UnauthorizedException(authGuardText(locale, "authenticationRequired"));
    }

    if (required && required.length) {
      const ok = required.includes("SUPER_ADMIN")
        ? req.user.isSuperAdmin
        : required.some((r) => req.user!.roles.includes(r));
      if (!ok) {
        throw new UnauthorizedException(authGuardText(locale, "insufficientPermissions"));
      }
    }

    return true;
  }
}
