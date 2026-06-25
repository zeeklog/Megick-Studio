import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import axios from "axios";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { Public } from "@/common/decorators/public.decorator";
import { ConfigSecretService } from "@/common/services/config-secret.service";
import {
  documentedOperation,
  redirectLocationHeader,
  sessionCookieResponseHeader,
  SessionUserDto,
} from "@/common/swagger/api-docs";
import { OAuthService } from "../oauth.service";
import { AuthService } from "../auth.service";
import { localeFromAcceptLanguage, normalizeLocale } from "@/common/locale";
import { jwtVerify, createRemoteJWKSet } from "jose";

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

class GoogleOneTapDto {
  @ApiProperty({
    description: "Google Identity Services `credential` ID token returned by One Tap.",
    example: "eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...",
  })
  @IsString()
  @MaxLength(8192)
  credential!: string;

  @ApiProperty({
    description: "Optional post-login relative path. The server only uses it for response metadata.",
    required: false,
    example: "/dashboard",
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  redirect?: string;

  @ApiProperty({
    description: "Whether locale was explicitly selected by the user or inferred from device settings.",
    required: false,
    enum: ["device", "explicit"],
    example: "explicit",
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  localeSource?: string;

  @ApiProperty({
    description: "Explicit app locale when localeSource is `explicit`.",
    required: false,
    example: "zh-CN",
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  locale?: string;
}

@ApiTags("auth/oauth")
@Controller("api/auth/google")
export class GoogleOAuthController {
  private readonly logger = new Logger(GoogleOAuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly oauth: OAuthService,
    private readonly secrets: ConfigSecretService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get("")
  @ApiOperation(
    documentedOperation(
      "Begin Google OAuth",
      "Starts the Google OAuth authorization flow. The client should open this endpoint in a browser or webview and follow the returned redirect.",
    ),
  )
  @ApiQuery({
    name: "redirect",
    required: false,
    type: String,
    description:
      "Optional post-login relative path such as `/dashboard` or `/studio`. Only relative paths beginning with `/` are honored; other values fall back to `/dashboard`.",
    example: "/dashboard",
  })
  @ApiFoundResponse({
    description:
      "Redirects to Google consent when the provider is enabled, or back to the web app with a `login_error` query parameter when Google OAuth is unavailable.",
    headers: {
      Location: redirectLocationHeader,
    },
  })
  async start(
    @Query("redirect") redirect: string | undefined,
    @Query("localeSource") localeSource: string | undefined,
    @Query("locale") queryLocale: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const normalizedLocaleSource = localeSource === "explicit" ? "explicit" : "device";
    const locale =
      normalizedLocaleSource === "explicit" && queryLocale
        ? normalizeLocale(queryLocale)
        : localeFromAcceptLanguage(req.get("accept-language"));
    await this.auth.assertOAuthEnabled("GOOGLE", locale);
    const cfg = await this.secrets.getOAuthConfig("GOOGLE");
    if (!cfg.clientId) {
      return res.redirect(`${this.webBase()}/?login_error=google_not_configured`);
    }
    const state = await this.oauth.issueState("GOOGLE", redirect, {
      locale,
      localeSource: normalizedLocaleSource,
    });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", cfg.clientId);
    url.searchParams.set("redirect_uri", cfg.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", cfg.scopes.join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    return res.redirect(url.toString());
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 600_000 } })
  @Post("onetap")
  @ApiOperation(
    documentedOperation(
      "Login with Google One Tap",
      "Verifies the Google Identity Services ID token returned by One Tap, creates or updates the local OAuth account, issues the `mg_session` cookie, and returns the signed-in user profile.",
    ),
  )
  @ApiOkResponse({
    description: "Google One Tap login succeeded and session cookie issued.",
    type: SessionUserDto,
    headers: {
      "Set-Cookie": sessionCookieResponseHeader,
    },
  })
  async oneTap(
    @Body() dto: GoogleOneTapDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const normalizedLocaleSource = dto.localeSource === "explicit" ? "explicit" : "device";
    const locale =
      normalizedLocaleSource === "explicit" && dto.locale
        ? normalizeLocale(dto.locale)
        : localeFromAcceptLanguage(req.get("accept-language"));

    await this.auth.assertOAuthEnabled("GOOGLE", locale);
    const cfg = await this.secrets.getOAuthConfig("GOOGLE");
    if (!cfg.clientId) {
      throw new BadRequestException("Google OAuth is not configured");
    }
    this.assertAllowedOneTapOrigin(req);

    const googleProfile = await this.verifyOneTapCredential(dto.credential, cfg.clientId);
    const userId = await this.oauth.upsertFromProfile({
      provider: "GOOGLE",
      providerUserId: googleProfile.sub,
      email: googleProfile.email,
      displayName: googleProfile.name,
      avatarUrl: googleProfile.picture,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      raw: googleProfile.raw,
      locale,
      localeSource: normalizedLocaleSource,
    });

    await this.auth.issueSession(res, userId);
    return this.auth.getMe(userId);
  }

  @Public()
  @Get("callback")
  @ApiOperation(
    documentedOperation(
      "Google OAuth callback",
      "Completes Google OAuth, creates or updates the local user, issues the `mg_session` cookie, and redirects the browser back to the requested in-product path.",
    ),
  )
  @ApiQuery({
    name: "code",
    required: false,
    type: String,
    description: "Authorization code returned by Google.",
  })
  @ApiQuery({
    name: "state",
    required: false,
    type: String,
    description:
      "Opaque OAuth state previously issued by the start endpoint. The callback is rejected when the state is missing, expired, or belongs to another provider.",
  })
  @ApiProduces("text/html")
  @ApiFoundResponse({
    description:
      "Redirects to the safe in-product target. On success it also sets the `mg_session` cookie. On failure it redirects to the web app with a `login_error` query parameter.",
    headers: {
      Location: redirectLocationHeader,
      "Set-Cookie": sessionCookieResponseHeader,
    },
  })
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    void req;
    if (!code || !state) return res.redirect(`${this.webBase()}/?login_error=missing_code`);
    const ctx = await this.oauth.consumeState(state);
    if (!ctx || ctx.provider !== "GOOGLE") {
      return res.redirect(`${this.webBase()}/?login_error=bad_state`);
    }
    try {
      const cfg = await this.secrets.getOAuthConfig("GOOGLE");
      const tokenRes = await axios.post(
        "https://oauth2.googleapis.com/token",
        new URLSearchParams({
          code,
          client_id: cfg.clientId,
          client_secret: cfg.clientSecret,
          redirect_uri: cfg.redirectUri,
          grant_type: "authorization_code",
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      );
      const accessToken: string = tokenRes.data.access_token;
      const refreshToken: string | undefined = tokenRes.data.refresh_token;
      const expiresAt = new Date(Date.now() + (tokenRes.data.expires_in ?? 3600) * 1000);

      const userInfoRes = await axios.get("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = userInfoRes.data;

      const userId = await this.oauth.upsertFromProfile({
        provider: "GOOGLE",
        providerUserId: String(data.sub),
        email: data.email,
        displayName: data.name,
        avatarUrl: data.picture,
        accessToken,
        refreshToken: refreshToken ?? null,
        expiresAt,
        raw: data,
        locale: ctx.locale,
        localeSource: ctx.localeSource,
      });

      await this.auth.issueSession(res, userId);
      return res.redirect(this.safeRedirect(ctx.redirectTo));
    } catch (err) {
      this.logger.error(`Google callback failed: ${(err as Error).message}`);
      return res.redirect(`${this.webBase()}/?login_error=google_failed`);
    }
  }

  private webBase(): string {
    return this.config.get<string>("WEB_BASE_URL", "http://localhost:8080");
  }

  private safeRedirect(target: string | undefined) {
    const fallback = `${this.webBase()}/dashboard`;
    if (!target) return fallback;
    if (target.startsWith("/")) return `${this.webBase()}${target}`;
    return fallback;
  }

  private assertAllowedOneTapOrigin(req: Request) {
    const origin = req.get("origin");
    if (!origin) return;

    const allowed = new Set<string>();
    for (const raw of [
      this.webBase(),
      this.config.get<string>("PUBLIC_BASE_URL"),
      this.config.get<string>("API_BASE_URL"),
      `${req.protocol}://${req.get("host")}`,
    ]) {
      const parsed = this.originForUrl(raw);
      if (parsed) allowed.add(parsed);
    }

    const requestOrigin = this.originForUrl(origin);
    if (!requestOrigin || !allowed.has(requestOrigin)) {
      throw new BadRequestException("Invalid Google One Tap origin");
    }
  }

  private originForUrl(raw: string | undefined) {
    if (!raw) return null;
    try {
      return new URL(raw).origin;
    } catch {
      return null;
    }
  }

  private async verifyOneTapCredential(credential: string | undefined, clientId: string) {
    if (!credential || typeof credential !== "string") {
      throw new BadRequestException("Missing Google credential");
    }

    const { payload } = await jwtVerify(credential, googleJwks, {
      audience: clientId,
      issuer: ["https://accounts.google.com", "accounts.google.com"],
    }).catch(() => {
      throw new BadRequestException("Invalid Google credential");
    });

    const sub = typeof payload.sub === "string" ? payload.sub : "";
    if (!sub) {
      throw new BadRequestException("Invalid Google credential");
    }
    const email = typeof payload.email === "string" ? payload.email : null;
    const emailVerified = payload.email_verified === true;

    return {
      sub,
      email: emailVerified ? email : null,
      name: typeof payload.name === "string" ? payload.name : null,
      picture: typeof payload.picture === "string" ? payload.picture : null,
      raw: { ...payload },
    };
  }
}
