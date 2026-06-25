import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiProperty, ApiTags } from "@nestjs/swagger";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { IsEmail, IsString } from "class-validator";
import type { Request, Response } from "express";
import { Public } from "@/common/decorators/public.decorator";
import { AuthService } from "../auth/auth.service";
import { PrismaService } from "nestjs-prisma";
import {
  ApiOkResponseModel,
  ApiValidationErrorResponse,
  SessionUserDto,
  SignupCaptchaResponseDto,
  documentedOperation,
  sessionCookieResponseHeader,
} from "@/common/swagger/api-docs";
import { localeFromAcceptLanguage, localizedText, type AppLocale } from "@/common/locale";

const adminLoginMessages = {
  "zh-CN": {
    forbidden: "没有管理员访问权限",
  },
  "zh-TW": {
    forbidden: "沒有管理員存取權限",
  },
  en: {
    forbidden: "Not authorised for admin",
  },
  ja: {
    forbidden: "管理者権限がありません",
  },
  fr: {
    forbidden: "Accès administrateur non autorisé",
  },
  de: {
    forbidden: "Keine Administratorberechtigung",
  },
};

function adminLoginText(locale: AppLocale | undefined, key: keyof typeof adminLoginMessages.en) {
  return localizedText(adminLoginMessages, locale, key);
}

class AdminLoginDto {
  @ApiProperty({
    description: "Admin email address. The account must already exist and hold the SUPER_ADMIN role.",
    example: "admin@example.com",
  })
  @IsEmail() email!: string;
  @ApiProperty({
    description: "Admin password.",
    example: "Megick123",
  })
  @IsString() password!: string;
  @ApiProperty({
    description: "Captcha ID returned by `GET /api/admin/auth/captcha`.",
    example: "kzHnD7uQ1bx1v7Lh3J4pYw1D",
  })
  @IsString() captchaId!: string;
  @ApiProperty({
    description: "Captcha code read from the returned image.",
    example: "A7KD9",
  })
  @IsString() captchaCode!: string;
}

/**
 * Admin login lives at /admin/login on the web side and posts to this
 * endpoint. We require both email/password authentication AND that the user
 * already has the SUPER_ADMIN role assigned (regular users cannot become
 * admins by guessing here).
 */
@ApiTags("admin/auth")
@ApiValidationErrorResponse()
@Controller("api/admin/auth")
export class AdminLoginController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get("captcha")
  @ApiOperation(
    documentedOperation(
      "Issue admin login captcha",
      "Returns a short-lived SVG captcha image and opaque captcha ID. The captcha is single-use and bound to the requesting device fingerprint.",
    ),
  )
  @ApiOkResponseModel(SignupCaptchaResponseDto, "Admin login captcha issued successfully.")
  captcha(@Req() req: Request) {
    return this.auth.issueAdminLoginCaptcha(this.adminCaptchaTracker(req));
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation(
    documentedOperation(
      "Admin login - super admins only",
      "Authenticates an existing account with email/password, verifies the SUPER_ADMIN role, issues the `mg_session` cookie, and returns the current signed-in admin profile.",
    ),
  )
  @ApiOkResponseModel(
    SessionUserDto,
    "Admin login succeeded and session cookie issued.",
    { "Set-Cookie": sessionCookieResponseHeader },
  )
  async login(
    @Body() dto: AdminLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const locale = localeFromAcceptLanguage(req.get("accept-language"));
    await this.auth.verifyAdminLoginCaptcha(
      dto.captchaId,
      dto.captchaCode,
      this.adminCaptchaTracker(req),
      locale,
    );
    const user = await this.auth.adminLoginWithPassword(dto.email, dto.password, locale);
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId: user.id },
      include: { role: true },
    });
    const isSuperAdmin = userRoles.some((r) => r.role.code === "SUPER_ADMIN");
    if (!isSuperAdmin) {
      throw new ForbiddenException(adminLoginText(locale, "forbidden"));
    }
    await this.auth.issueSession(res, user.id);
    return this.auth.getMe(user.id);
  }

  private adminCaptchaTracker(req: Request) {
    const ip = req.ip || "unknown";
    const userAgent = req.get("user-agent")?.trim() || "unknown";
    return `${ip}|${userAgent}`;
  }
}
