import { Controller, Get, Logger, Query, Req, Res } from "@nestjs/common";
import {
  ApiFoundResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import axios, { AxiosError } from "axios";
import { createHash, randomBytes } from "crypto";
import { Public } from "@/common/decorators/public.decorator";
import { ConfigSecretService } from "@/common/services/config-secret.service";
import {
  documentedOperation,
  redirectLocationHeader,
  sessionCookieResponseHeader,
} from "@/common/swagger/api-docs";
import { OAuthService } from "../oauth.service";
import { AuthService } from "../auth.service";
import { localeFromAcceptLanguage, normalizeLocale } from "@/common/locale";

@ApiTags("auth/oauth")
@Controller("api/auth/github")
export class GithubOAuthController {
  private readonly logger = new Logger(GithubOAuthController.name);

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
      "Begin GitHub OAuth",
      "Starts the GitHub OAuth flow with PKCE protection. The client should open this endpoint in a browser or webview and follow the returned redirect.",
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
      "Redirects to GitHub authorization when the provider is enabled, or back to the web app with a `login_error` query parameter when GitHub OAuth is unavailable.",
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
    await this.auth.assertOAuthEnabled("GITHUB", locale);
    const cfg = await this.secrets.getOAuthConfig("GITHUB");
    if (!cfg.clientId)
      return res.redirect(
        `${this.webBase()}/?login_error=github_not_configured`,
      );
    const codeVerifier = this.createCodeVerifier();
    const state = await this.oauth.issueState("GITHUB", redirect, {
      codeVerifier,
      locale,
      localeSource: normalizedLocaleSource,
    });
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", cfg.clientId);
    url.searchParams.set("redirect_uri", cfg.redirectUri);
    url.searchParams.set("scope", cfg.scopes.join(" "));
    url.searchParams.set("state", state);
    url.searchParams.set(
      "code_challenge",
      this.createCodeChallenge(codeVerifier),
    );
    url.searchParams.set("code_challenge_method", "S256");
    return res.redirect(url.toString());
  }

  @Public()
  @Get("callback")
  @ApiOperation(
    documentedOperation(
      "GitHub OAuth callback",
      "Completes GitHub OAuth, creates or updates the local user, issues the `mg_session` cookie, and redirects the browser back to the requested in-product path.",
    ),
  )
  @ApiQuery({
    name: "code",
    required: false,
    type: String,
    description: "Authorization code returned by GitHub.",
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
    if (!code || !state)
      return res.redirect(`${this.webBase()}/?login_error=missing_code`);
    const ctx = await this.oauth.consumeState(state);
    if (!ctx || ctx.provider !== "GITHUB")
      return res.redirect(`${this.webBase()}/?login_error=bad_state`);
    try {
      const cfg = await this.secrets.getOAuthConfig("GITHUB");
      const tokenPayload = new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code,
        redirect_uri: cfg.redirectUri,
      });
      if (ctx.codeVerifier) {
        tokenPayload.set("code_verifier", ctx.codeVerifier);
      }
      const tokenRes = await axios.post(
        "https://github.com/login/oauth/access_token",
        tokenPayload,
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );
      if (!tokenRes.data?.access_token) {
        this.logger.error(
          `GitHub token exchange did not return access_token: ${JSON.stringify(tokenRes.data)}`,
        );
        return res.redirect(
          `${this.webBase()}/?login_error=github_token_failed`,
        );
      }
      const accessToken: string = tokenRes.data.access_token;
      const userRes = await axios.get("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "megick-oauth",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      const data = userRes.data;
      let email: string | undefined = data.email;
      if (!email) {
        try {
          const emailRes = await axios.get(
            "https://api.github.com/user/emails",
            {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: "application/vnd.github+json",
                "User-Agent": "megick-oauth",
                "X-GitHub-Api-Version": "2022-11-28",
              },
            },
          );
          const primary = (
            emailRes.data as Array<{
              primary: boolean;
              verified: boolean;
              email: string;
            }>
          ).find((e) => e.primary && e.verified);
          email = primary?.email;
        } catch (err) {
          this.logGithubError("GitHub email lookup failed", err);
        }
      }

      const userId = await this.oauth.upsertFromProfile({
        provider: "GITHUB",
        providerUserId: String(data.id),
        email,
        displayName: data.name ?? data.login,
        avatarUrl: data.avatar_url,
        accessToken,
        raw: data,
        locale: ctx.locale,
        localeSource: ctx.localeSource,
      });

      await this.auth.issueSession(res, userId);
      return res.redirect(this.safeRedirect(ctx.redirectTo));
    } catch (err) {
      this.logGithubError("GitHub callback failed", err);
      return res.redirect(`${this.webBase()}/?login_error=github_failed`);
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

  private createCodeVerifier() {
    return randomBytes(32).toString("base64url");
  }

  private createCodeChallenge(codeVerifier: string) {
    return createHash("sha256").update(codeVerifier).digest("base64url");
  }

  private logGithubError(prefix: string, err: unknown) {
    if (err instanceof AxiosError) {
      const status = err.response?.status;
      const url = err.config?.url;
      const payload =
        typeof err.response?.data === "string"
          ? err.response.data
          : JSON.stringify(err.response?.data);
      const hint =
        status === 403 && url?.includes("/user/emails")
          ? " hint=If this provider uses a GitHub App, enable User permissions -> Email addresses (read)."
          : "";
      this.logger.error(
        `${prefix}: status=${status ?? "unknown"} url=${url ?? "unknown"} body=${payload}${hint}`,
      );
      return;
    }
    this.logger.error(`${prefix}: ${(err as Error).message}`);
  }
}
