import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiBody,
  ApiConsumes,
  ApiFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import axios from "axios";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";
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
import { DEFAULT_LOCALE, localeFromAcceptLanguage, localizedText, normalizeLocale, type AppLocale } from "@/common/locale";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
const APPLE_JWKS = createRemoteJWKSet(new URL(`${APPLE_ISSUER}/auth/keys`));

const appleMessages = {
  "zh-CN": {
    missingIdentityToken: "缺少 Apple 身份令牌",
    clientIdNotConfigured: "Apple 客户端 ID 未配置",
  },
  "zh-TW": {
    missingIdentityToken: "缺少 Apple 身分權杖",
    clientIdNotConfigured: "Apple 用戶端 ID 未設定",
  },
  en: {
    missingIdentityToken: "Missing identity token",
    clientIdNotConfigured: "Apple client ID is not configured",
  },
  ja: {
    missingIdentityToken: "Apple ID トークンがありません",
    clientIdNotConfigured: "Apple クライアント ID が設定されていません",
  },
  fr: {
    missingIdentityToken: "Jeton d'identité Apple manquant",
    clientIdNotConfigured: "L'ID client Apple n'est pas configuré",
  },
  de: {
    missingIdentityToken: "Apple-Identitätstoken fehlt",
    clientIdNotConfigured: "Apple-Client-ID ist nicht konfiguriert",
  },
};

function appleText(locale: AppLocale | undefined, key: keyof typeof appleMessages.en) {
  return localizedText(appleMessages, locale, key);
}

class AppleFullNameDto {
  @ApiPropertyOptional({ example: "Neo" })
  givenName?: string;

  @ApiPropertyOptional({ example: "Creator" })
  familyName?: string;

  @ApiPropertyOptional({ example: "Neo Creator" })
  name?: string;
}

class AppleNativeLoginDto {
  @ApiProperty({
    description: "Apple identity token returned by expo-apple-authentication.",
    example: "eyJraWQiOiJ...",
  })
  identityToken!: string;

  @ApiPropertyOptional({
    description:
      "Authorization code returned by Apple. When a client secret is configured, the backend exchanges this code to retain refresh/token metadata.",
    example: "c1234567890abcdef",
  })
  authorizationCode?: string;

  @ApiPropertyOptional({
    description:
      "Email returned by Apple on the first authorization. The identity token remains the source of truth when it contains email.",
    example: "creator@example.com",
  })
  email?: string;

  @ApiPropertyOptional({
    description: "Full name object returned by the native Apple sign-in sheet.",
    type: AppleFullNameDto,
  })
  fullName?: AppleFullNameDto | string | null;

  @ApiPropertyOptional({
    description:
      "Raw Apple user JSON string returned by web/native clients on the first authorization.",
    example: "{\"name\":{\"firstName\":\"Neo\",\"lastName\":\"Creator\"},\"email\":\"creator@example.com\"}",
  })
  user?: string | Record<string, unknown>;
}

@ApiTags("auth/oauth")
@Controller("api/auth/apple")
export class AppleOAuthController {
  private readonly logger = new Logger(AppleOAuthController.name);

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
      "Begin Apple OAuth",
      "Starts Sign in with Apple for web clients. Apple posts the authorization response back to the callback endpoint, so the callback route accepts form-encoded POST bodies.",
    ),
  )
  @ApiQuery({
    name: "redirect",
    required: false,
    type: String,
    description:
      "Optional post-login relative path such as `/dashboard` or `/studio`. Only relative paths beginning with `/` are honored.",
    example: "/dashboard",
  })
  @ApiFoundResponse({
    description:
      "Redirects to Apple's authorization page when Apple OAuth is enabled.",
    headers: { Location: redirectLocationHeader },
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
    await this.auth.assertOAuthEnabled("APPLE", locale);
    const cfg = await this.secrets.getOAuthConfig("APPLE");
    if (!cfg.clientId) {
      return res.redirect(`${this.webBase()}/?login_error=apple_not_configured`);
    }

    const state = await this.oauth.issueState("APPLE", redirect, {
      locale,
      localeSource: normalizedLocaleSource,
    });
    const url = new URL(`${APPLE_ISSUER}/auth/authorize`);
    url.searchParams.set("client_id", cfg.clientId);
    url.searchParams.set("redirect_uri", cfg.redirectUri);
    url.searchParams.set("response_type", "code id_token");
    url.searchParams.set("response_mode", "form_post");
    url.searchParams.set("scope", cfg.scopes.join(" "));
    url.searchParams.set("state", state);
    return res.redirect(url.toString());
  }

  @Public()
  @Post("callback")
  @ApiConsumes("application/x-www-form-urlencoded")
  @ApiProduces("text/html")
  @ApiOperation(
    documentedOperation(
      "Apple OAuth callback",
      "Completes Sign in with Apple for web clients, creates or updates the local user, issues the `mg_session` cookie, and redirects back into the product.",
    ),
  )
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        code: { type: "string" },
        id_token: { type: "string" },
        state: { type: "string" },
        user: { type: "string" },
        error: { type: "string" },
      },
    },
  })
  @ApiFoundResponse({
    description:
      "Redirects to the safe in-product target. On success it also sets the `mg_session` cookie. On failure it redirects to the web app with a `login_error` query parameter.",
    headers: {
      Location: redirectLocationHeader,
      "Set-Cookie": sessionCookieResponseHeader,
    },
  })
  async callback(@Body() body: Record<string, unknown>, @Res() res: Response) {
    const error = this.stringValue(body.error);
    if (error) {
      return res.redirect(`${this.webBase()}/?login_error=apple_${encodeURIComponent(error)}`);
    }

    const code = this.stringValue(body.code);
    const identityToken = this.stringValue(body.id_token);
    const state = this.stringValue(body.state);
    if (!identityToken || !state) {
      return res.redirect(`${this.webBase()}/?login_error=missing_code`);
    }

    const ctx = await this.oauth.consumeState(state);
    if (!ctx || ctx.provider !== "APPLE") {
      return res.redirect(`${this.webBase()}/?login_error=bad_state`);
    }

    try {
      const result = await this.signInWithIdentityToken({
        identityToken,
        authorizationCode: code,
        rawUser: body.user,
        redirectUriForToken: true,
        locale: ctx.locale,
        localeSource: ctx.localeSource,
      });

      await this.auth.issueSession(res, result.userId);
      return res.redirect(this.safeRedirect(ctx.redirectTo));
    } catch (err) {
      this.logger.error(`Apple callback failed: ${(err as Error).message}`);
      return res.redirect(`${this.webBase()}/?login_error=apple_failed`);
    }
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post("native")
  @ApiConsumes("application/json")
  @ApiOperation(
    documentedOperation(
      "Native Apple login",
      "Accepts the Apple identity token returned by iOS, verifies it against Apple's JWKS, creates or updates the local user, and issues the `mg_session` cookie for native clients.",
    ),
  )
  @ApiOkResponse({
    description:
      "Apple native login succeeded and issued the `mg_session` cookie.",
    type: SessionUserDto,
    headers: { "Set-Cookie": sessionCookieResponseHeader },
  })
  async native(
    @Body() dto: AppleNativeLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const locale = localeFromAcceptLanguage(req.get("accept-language"));
    await this.auth.assertOAuthEnabled("APPLE", locale);
    const result = await this.signInWithIdentityToken({
      identityToken: dto.identityToken,
      authorizationCode: dto.authorizationCode,
      email: dto.email,
      fullName: dto.fullName,
      rawUser: dto.user,
      redirectUriForToken: false,
      locale,
    });

    await this.auth.issueSession(res, result.userId);
    return this.auth.getMe(result.userId);
  }

  private async signInWithIdentityToken(input: {
    identityToken?: string;
    authorizationCode?: string;
    email?: string;
    fullName?: AppleNativeLoginDto["fullName"];
    rawUser?: unknown;
    redirectUriForToken: boolean;
    locale?: AppLocale;
    localeSource?: "device" | "explicit";
  }) {
    const locale = input.locale ?? DEFAULT_LOCALE;
    if (!input.identityToken) throw new BadRequestException(appleText(locale, "missingIdentityToken"));
    const cfg = await this.secrets.getOAuthConfig("APPLE");
    const audiences = this.appleAudiences(cfg);
    if (!audiences.length) throw new BadRequestException(appleText(locale, "clientIdNotConfigured"));

    const { payload } = await jwtVerify(input.identityToken, APPLE_JWKS, {
      issuer: APPLE_ISSUER,
      audience: audiences,
    });

    const appleUser = this.parseAppleUser(input.rawUser);
    const tokenResponse = await this.exchangeCodeIfConfigured({
      authorizationCode: input.authorizationCode,
      redirectUri: input.redirectUriForToken ? cfg.redirectUri : undefined,
      cfg,
    });
    const displayName =
      this.displayNameFromNative(input.fullName) ??
      this.displayNameFromAppleUser(appleUser) ??
      undefined;
    const email =
      this.stringValue(payload.email) ??
      input.email ??
      this.stringValue(appleUser?.email) ??
      undefined;
    const expiresAt =
      tokenResponse?.expires_in && Number.isFinite(Number(tokenResponse.expires_in))
        ? new Date(Date.now() + Number(tokenResponse.expires_in) * 1000)
        : null;

    const userId = await this.oauth.upsertFromProfile({
      provider: "APPLE",
      providerUserId: String(payload.sub),
      email,
      displayName,
      avatarUrl: null,
      accessToken: this.stringValue(tokenResponse?.access_token) ?? null,
      refreshToken: this.stringValue(tokenResponse?.refresh_token) ?? null,
      expiresAt,
      raw: {
        tokenClaims: payload,
        appleUser,
        tokenResponse: tokenResponse ? this.safeTokenResponse(tokenResponse) : null,
      },
      locale,
      localeSource: input.localeSource,
    });

    return { userId };
  }

  private appleAudiences(cfg: Awaited<ReturnType<ConfigSecretService["getOAuthConfig"]>>) {
    const extra = cfg.extra ?? {};
    const values = [
      cfg.clientId,
      this.stringValue(extra.serviceId),
      this.stringValue(extra.bundleId),
      ...this.stringArray(extra.bundleIds),
      ...this.stringArray(extra.nativeClientIds),
    ];
    return [...new Set(values.map((item) => item?.trim()).filter((item): item is string => Boolean(item)))];
  }

  private async exchangeCodeIfConfigured(input: {
    authorizationCode?: string;
    redirectUri?: string;
    cfg: Awaited<ReturnType<ConfigSecretService["getOAuthConfig"]>>;
  }) {
    const code = input.authorizationCode?.trim();
    if (!code || !input.cfg.clientId) return null;
    const clientSecret = await this.appleClientSecret(input.cfg);
    if (!clientSecret) return null;

    const body = new URLSearchParams({
      client_id: input.cfg.clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
    });
    if (input.redirectUri) body.set("redirect_uri", input.redirectUri);

    const response = await axios.post(APPLE_TOKEN_URL, body, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    return response.data as Record<string, unknown>;
  }

  private async appleClientSecret(
    cfg: Awaited<ReturnType<ConfigSecretService["getOAuthConfig"]>>,
  ) {
    if (cfg.clientSecret) return cfg.clientSecret;
    const extra = cfg.extra ?? {};
    const teamId = this.stringValue(extra.teamId);
    const keyId = this.stringValue(extra.keyId);
    const rawPrivateKey = this.stringValue(extra.privateKey);
    if (!teamId || !keyId || !rawPrivateKey || !cfg.clientId) return "";

    const privateKey = rawPrivateKey.includes("\\n")
      ? rawPrivateKey.replace(/\\n/g, "\n")
      : rawPrivateKey;
    const key = await importPKCS8(privateKey, "ES256");
    return new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: keyId })
      .setIssuer(teamId)
      .setIssuedAt()
      .setExpirationTime("180d")
      .setAudience(APPLE_ISSUER)
      .setSubject(cfg.clientId)
      .sign(key);
  }

  private parseAppleUser(value: unknown): Record<string, unknown> | null {
    if (!value) return null;
    if (typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    if (typeof value !== "string") return null;
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  private displayNameFromAppleUser(user: Record<string, unknown> | null) {
    const name = user?.name;
    if (!name || typeof name !== "object" || Array.isArray(name)) return null;
    const record = name as Record<string, unknown>;
    return this.joinName(
      this.stringValue(record.firstName) ?? this.stringValue(record.givenName),
      this.stringValue(record.lastName) ?? this.stringValue(record.familyName),
    );
  }

  private displayNameFromNative(fullName: AppleNativeLoginDto["fullName"]) {
    if (!fullName) return null;
    if (typeof fullName === "string") return fullName.trim() || null;
    return (
      this.stringValue(fullName.name) ??
      this.joinName(fullName.givenName, fullName.familyName)
    );
  }

  private joinName(first?: string | null, last?: string | null) {
    const value = [first, last].map((item) => item?.trim()).filter(Boolean).join(" ");
    return value || null;
  }

  private stringValue(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  private stringArray(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }

  private safeTokenResponse(response: Record<string, unknown>) {
    return {
      token_type: response.token_type,
      expires_in: response.expires_in,
      refresh_token_present: Boolean(response.refresh_token),
      access_token_present: Boolean(response.access_token),
      id_token_present: Boolean(response.id_token),
    };
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
}
