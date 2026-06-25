import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from "@nestjs/swagger";
import { Allow, IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import type { Request, Response } from "express";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { Public } from "@/common/decorators/public.decorator";
import { CurrentUser, type AuthUserContext } from "@/common/decorators/current-user.decorator";
import { SessionService } from "@/common/services/session.service";
import {
  ApiOkResponseModel,
  ApiSessionCookieAuth,
  ApiValidationErrorResponse,
  AuthConfigResponseDto,
  AuthMeResponseDto,
  OkResponseDto,
  SessionUserDto,
  documentedOperation,
  sessionCookieResponseHeader,
} from "@/common/swagger/api-docs";
import { localeFromAcceptLanguage } from "@/common/locale";

function localeSourceFromRequest(req: Request) {
  return req.get("x-megick-locale-source") === "explicit" ? "explicit" : "device";
}

class RegisterDto {
  @ApiProperty({
    description: "Registration email. This value also becomes the initial login identifier.",
    example: "creator@example.com",
  })
  @IsEmail()
  @MaxLength(191)
  email!: string;

  @ApiProperty({
    description: "Registration password. Minimum length is 6 characters.",
    minLength: 6,
    example: "Megick123",
  })
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;

  @ApiProperty({
    description:
      "Email verification ID returned by `POST /api/auth/registration-email-code`. Required only when SMTP registration verification is enabled.",
    required: false,
    example: "WbX0jKf8kE4mA1x5tR2vP9dN",
  })
  @Allow()
  emailVerificationId?: unknown;

  @ApiProperty({
    description:
      "One-time email verification code. Required only when SMTP registration verification is enabled.",
    required: false,
    example: "294173",
  })
  @Allow()
  emailVerificationCode?: unknown;
}

class RegistrationEmailCodeDto {
  @ApiProperty({
    description: "Registration email address that should receive the verification code.",
    example: "creator@example.com",
  })
  @IsEmail()
  @MaxLength(191)
  email!: string;
}

class LoginDto {
  @ApiProperty({
    description: "Login email.",
    example: "creator@example.com",
  })
  @IsEmail()
  @MaxLength(191)
  email!: string;

  @ApiProperty({
    description: "Login password.",
    example: "Megick123",
  })
  @IsString()
  @MaxLength(128)
  password!: string;
}

class ChangePasswordDto {
  @ApiProperty({
    description:
      "Current password. Required only when the account already has a password-based login configured.",
    required: false,
    example: "Megick123",
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  currentPassword?: string;

  @ApiProperty({
    description: "New password. Minimum length is 8 characters.",
    minLength: 8,
    example: "Megick456",
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}

@ApiTags("auth")
@ApiValidationErrorResponse()
@Controller("api/auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @Post("register")
  @ApiOperation(
    documentedOperation(
      "Register with email + password",
      "Creates a new account, validates email verification, issues the `mg_session` cookie, and returns the signed-in user profile that downstream apps should cache for the current session.",
    ),
  )
  @ApiOkResponseModel(SessionUserDto, "Account created successfully and session cookie issued.", {
    "Set-Cookie": sessionCookieResponseHeader,
  })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const locale = localeFromAcceptLanguage(req.get("accept-language"));
    const user = await this.auth.register({
      ...dto,
      emailVerificationTracker: this.registrationVerificationTracker(req),
      locale,
      localeSource: localeSourceFromRequest(req),
    });
    await this.auth.issueSession(res, user.id);
    return this.auth.getMe(user.id);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @HttpCode(HttpStatus.OK)
  @Post("registration-email-code")
  @ApiOperation(
    documentedOperation(
      "Send a registration email verification code",
      "Sends a one-time verification code to the registration email address. The returned ID and emailed code must be submitted with registration.",
    ),
  )
  async registrationEmailCode(@Body() dto: RegistrationEmailCodeDto, @Req() req: Request) {
    return this.auth.issueRegistrationEmailVerification(
      dto.email,
      this.registrationVerificationTracker(req),
      localeFromAcceptLanguage(req.get("accept-language")),
    );
  }

  @Public()
  @Get("config")
  @ApiOperation(
    documentedOperation(
      "Get public authentication configuration",
      "Returns runtime sign-in capabilities that clients should read before rendering login or registration UI. This endpoint is safe to call anonymously at app bootstrap.",
    ),
  )
  @ApiOkResponseModel(
    AuthConfigResponseDto,
    "Authentication capabilities loaded successfully.",
  )
  config(@Req() req: Request) {
    return this.auth.getAuthConfig(localeFromAcceptLanguage(req.get("accept-language")));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("login")
  @ApiOperation(
    documentedOperation(
      "Login with email + password",
      "Authenticates the account, issues the `mg_session` cookie, and returns the current signed-in user payload that downstream apps should use as their initial session state.",
    ),
  )
  @ApiOkResponseModel(SessionUserDto, "Login succeeded and session cookie issued.", {
    "Set-Cookie": sessionCookieResponseHeader,
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.auth.loginWithPassword(
      dto.email,
      dto.password,
      localeFromAcceptLanguage(req.get("accept-language")),
    );
    await this.auth.issueSession(res, user.id);
    return this.auth.getMe(user.id);
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @Post("password")
  @ApiSessionCookieAuth(
    "Requires a valid `mg_session` cookie. Native clients should send credentials on this request.",
  )
  @ApiOperation(
    documentedOperation(
      "Change current user's password",
      "Updates the password for the current signed-in account. When the account already has a password, `currentPassword` must also be provided and verified first.",
    ),
  )
  @ApiOkResponseModel(
    OkResponseDto,
    "Password updated successfully.",
  )
  changePassword(
    @CurrentUser() user: AuthUserContext,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    return this.auth.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      localeFromAcceptLanguage(req.get("accept-language")),
    );
  }

  @Public()
  @Get("me")
  @ApiCookieAuth("mg_session")
  @ApiOperation(
    documentedOperation(
      "Get current session user",
      "Resolves the current session cookie into a user payload. Clients should treat `user=null` as a signed-out state instead of an error.",
    ),
  )
  @ApiOkResponseModel(
    AuthMeResponseDto,
    "Session lookup completed. `user` is null when no valid session cookie is present.",
  )
  async me(@CurrentUser() user: AuthUserContext | null) {
    if (!user) return { user: null };
    const me = await this.auth.getMe(user.id);
    return { user: me };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("logout")
  @ApiCookieAuth("mg_session")
  @ApiOperation(
    documentedOperation(
      "Sign out and revoke the session",
      "Revokes the current session when a valid session cookie is present and clears the browser cookie. Calling this endpoint without a session cookie is also safe and still returns `{ ok: true }`.",
    ),
  )
  @ApiOkResponse({
    description: "Session revoked or already absent. The response clears the session cookie.",
    type: OkResponseDto,
    headers: {
      "Set-Cookie": sessionCookieResponseHeader,
    },
  })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookie = (req.cookies ?? {})[this.sessions.cookieKey()];
    if (cookie) {
      const payload = await this.sessions.verify(cookie);
      if (payload) {
        await this.sessions.revoke(payload.jti);
      }
    }
    this.sessions.clearCookie(res);
    return { ok: true };
  }

  private registrationVerificationTracker(req: Request) {
    const ip = req.ip || "unknown";
    const userAgent = req.get("user-agent")?.trim() || "unknown";
    return `${ip}|${userAgent}`;
  }
}
