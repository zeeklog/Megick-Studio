import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { randomInt } from "node:crypto";
import { PrismaService } from "nestjs-prisma";
import * as argon2 from "argon2";
import type { Response } from "express";
import { SessionService } from "@/common/services/session.service";
import type { OAuthProviderEnum } from "@prisma/client";
import { RedisService } from "@/common/services/redis.service";
import { randomId } from "@/common/random-id";
import {
  AUTH_DEFAULT_REGISTRATION_CREDITS_KEY,
  readDefaultRegistrationCredits,
} from "@/modules/site-settings/site-settings.service";
import { SmtpService } from "@/modules/smtp/smtp.service";
import { DEFAULT_LOCALE, localizedText, type AppLocale } from "@/common/locale";
import { AdvancedAccessService } from "@/common/services/advanced-access.service";

const AUTH_PASSWORD_LOGIN_KEY = "auth.passwordLoginEnabled";
const AUTH_REGISTRATION_KEY = "auth.registrationEnabled";
const REGISTRATION_DISABLED_MESSAGE =
  "注册功能已关闭，获取注册邀请请邮件：register-invite@megick.com";
const ADMIN_LOGIN_CAPTCHA_TTL_SECONDS = 3 * 60;
const ADMIN_LOGIN_CAPTCHA_LENGTH = 5;
const CAPTCHA_CHARSET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const EMAIL_VERIFICATION_TTL_SECONDS = 10 * 60;
const EMAIL_VERIFICATION_RESEND_SECONDS = 60;
const EMAIL_VERIFICATION_LENGTH = 6;

const authMessages = {
  "zh-CN": {
    registrationDisabled: REGISTRATION_DISABLED_MESSAGE,
    emailRequired: "请输入邮箱",
    emailInUse: "邮箱已被使用",
    oauthProviderDisabled: "第三方登录方式已关闭",
    passwordTooShort: "密码至少需要 6 个字符",
    passwordTooLong: "密码最多 128 个字符",
    passwordLoginDisabled: "密码登录已关闭",
    invalidEmailOrPassword: "邮箱或密码错误",
    accountDisabled: "账号已被禁用",
    newPasswordTooShort: "新密码至少需要 8 个字符",
    newPasswordTooLong: "新密码最多 128 个字符",
    currentPasswordTooLong: "当前密码最多 128 个字符",
    authenticationRequired: "请先登录",
    currentPasswordRequired: "请输入当前密码",
    currentPasswordIncorrect: "当前密码不正确",
    emailCodeCooldown: "验证码发送过于频繁，请稍后再试",
    captchaRequired: "请输入验证码",
    captchaExpired: "验证码已失效，请刷新后重试",
    captchaInvalidSession: "验证码校验失败，请刷新后重试",
    captchaIncorrect: "验证码错误，请重试",
    emailVerificationRequired: "请输入邮箱验证码",
    emailVerificationExpired: "邮箱验证码已失效，请重新发送",
    emailVerificationInvalidSession: "邮箱验证码校验失败，请重新发送",
    emailVerificationIncorrect: "邮箱验证码错误，请重试",
  },
  "zh-TW": {
    registrationDisabled:
      "目前暫停註冊。如需註冊邀請，請寄信至 register-invite@megick.com。",
    emailRequired: "請輸入電子郵件",
    emailInUse: "此電子郵件已被使用",
    oauthProviderDisabled: "第三方登入方式已關閉",
    passwordTooShort: "密碼至少需要 6 個字元",
    passwordTooLong: "密碼最多 128 個字元",
    passwordLoginDisabled: "密碼登入已關閉",
    invalidEmailOrPassword: "電子郵件或密碼錯誤",
    accountDisabled: "帳號已被停用",
    newPasswordTooShort: "新密碼至少需要 8 個字元",
    newPasswordTooLong: "新密碼最多 128 個字元",
    currentPasswordTooLong: "目前密碼最多 128 個字元",
    authenticationRequired: "請先登入",
    currentPasswordRequired: "請輸入目前密碼",
    currentPasswordIncorrect: "目前密碼不正確",
    emailCodeCooldown: "驗證碼發送過於頻繁，請稍後再試",
    captchaRequired: "請輸入驗證碼",
    captchaExpired: "驗證碼已失效，請重新整理後再試",
    captchaInvalidSession: "驗證碼驗證失敗，請重新整理後再試",
    captchaIncorrect: "驗證碼錯誤，請重試",
    emailVerificationRequired: "請輸入電子郵件驗證碼",
    emailVerificationExpired: "電子郵件驗證碼已失效，請重新發送",
    emailVerificationInvalidSession: "電子郵件驗證失敗，請重新發送驗證碼",
    emailVerificationIncorrect: "電子郵件驗證碼錯誤，請重試",
  },
  en: {
    registrationDisabled:
      "Registration is currently closed. To request an invitation, email register-invite@megick.com.",
    emailRequired: "Please enter your email address",
    emailInUse: "Email already in use",
    oauthProviderDisabled: "OAuth provider is disabled",
    passwordTooShort: "Password too short",
    passwordTooLong: "Password must be at most 128 characters",
    passwordLoginDisabled: "Password login is disabled",
    invalidEmailOrPassword: "Invalid email or password",
    accountDisabled: "Account disabled",
    newPasswordTooShort: "New password must be at least 8 characters",
    newPasswordTooLong: "New password must be at most 128 characters",
    currentPasswordTooLong: "Current password must be at most 128 characters",
    authenticationRequired: "Authentication required",
    currentPasswordRequired: "Current password is required",
    currentPasswordIncorrect: "Current password is incorrect",
    emailCodeCooldown: "Verification codes are being sent too frequently. Please try again later.",
    captchaRequired: "Please enter the verification code",
    captchaExpired: "The verification code has expired. Please refresh and try again.",
    captchaInvalidSession: "Verification failed. Please refresh and try again.",
    captchaIncorrect: "Incorrect verification code. Please try again.",
    emailVerificationRequired: "Please enter the email verification code",
    emailVerificationExpired: "The email verification code has expired. Please request a new one.",
    emailVerificationInvalidSession: "Email verification failed. Please request a new code.",
    emailVerificationIncorrect: "Incorrect email verification code. Please try again.",
  },
  ja: {
    registrationDisabled:
      "現在、新規登録は停止中です。招待を希望する場合は register-invite@megick.com までメールしてください。",
    emailRequired: "メールアドレスを入力してください",
    emailInUse: "このメールアドレスはすでに使用されています",
    oauthProviderDisabled: "外部ログインは無効になっています",
    passwordTooShort: "パスワードは 6 文字以上で入力してください",
    passwordTooLong: "パスワードは 128 文字以内で入力してください",
    passwordLoginDisabled: "パスワードログインは無効になっています",
    invalidEmailOrPassword: "メールアドレスまたはパスワードが正しくありません",
    accountDisabled: "アカウントが無効になっています",
    newPasswordTooShort: "新しいパスワードは 8 文字以上で入力してください",
    newPasswordTooLong: "新しいパスワードは 128 文字以内で入力してください",
    currentPasswordTooLong: "現在のパスワードは 128 文字以内で入力してください",
    authenticationRequired: "ログインしてください",
    currentPasswordRequired: "現在のパスワードを入力してください",
    currentPasswordIncorrect: "現在のパスワードが正しくありません",
    emailCodeCooldown: "確認コードの送信が多すぎます。しばらくしてからもう一度お試しください。",
    captchaRequired: "確認コードを入力してください",
    captchaExpired: "確認コードの有効期限が切れました。更新してもう一度お試しください。",
    captchaInvalidSession: "確認に失敗しました。更新してもう一度お試しください。",
    captchaIncorrect: "確認コードが正しくありません。もう一度お試しください。",
    emailVerificationRequired: "メール確認コードを入力してください",
    emailVerificationExpired: "メール確認コードの有効期限が切れました。新しいコードを取得してください。",
    emailVerificationInvalidSession: "メール確認に失敗しました。新しいコードを取得してください。",
    emailVerificationIncorrect: "メール確認コードが正しくありません。もう一度お試しください。",
  },
  fr: {
    registrationDisabled:
      "Les inscriptions sont actuellement fermées. Pour demander une invitation, écrivez à register-invite@megick.com.",
    emailRequired: "Veuillez saisir votre adresse e-mail",
    emailInUse: "Cette adresse e-mail est déjà utilisée",
    oauthProviderDisabled: "La connexion tierce est désactivée",
    passwordTooShort: "Le mot de passe doit contenir au moins 6 caractères",
    passwordTooLong: "Le mot de passe doit contenir au maximum 128 caractères",
    passwordLoginDisabled: "La connexion par mot de passe est désactivée",
    invalidEmailOrPassword: "E-mail ou mot de passe incorrect",
    accountDisabled: "Le compte est désactivé",
    newPasswordTooShort: "Le nouveau mot de passe doit contenir au moins 8 caractères",
    newPasswordTooLong: "Le nouveau mot de passe doit contenir au maximum 128 caractères",
    currentPasswordTooLong: "Le mot de passe actuel doit contenir au maximum 128 caractères",
    authenticationRequired: "Authentification requise",
    currentPasswordRequired: "Veuillez saisir le mot de passe actuel",
    currentPasswordIncorrect: "Le mot de passe actuel est incorrect",
    emailCodeCooldown: "Les codes sont envoyés trop fréquemment. Veuillez réessayer plus tard.",
    captchaRequired: "Veuillez saisir le code de vérification",
    captchaExpired: "Le code de vérification a expiré. Actualisez et réessayez.",
    captchaInvalidSession: "La vérification a échoué. Actualisez et réessayez.",
    captchaIncorrect: "Code de vérification incorrect. Veuillez réessayer.",
    emailVerificationRequired: "Veuillez saisir le code de vérification e-mail",
    emailVerificationExpired: "Le code de vérification e-mail a expiré. Demandez-en un nouveau.",
    emailVerificationInvalidSession: "La vérification e-mail a échoué. Demandez un nouveau code.",
    emailVerificationIncorrect: "Code de vérification e-mail incorrect. Veuillez réessayer.",
  },
  de: {
    registrationDisabled:
      "Die Registrierung ist derzeit geschlossen. Fordern Sie eine Einladung per E-Mail an register-invite@megick.com an.",
    emailRequired: "Bitte geben Sie Ihre E-Mail-Adresse ein",
    emailInUse: "Diese E-Mail-Adresse wird bereits verwendet",
    oauthProviderDisabled: "Drittanbieter-Anmeldung ist deaktiviert",
    passwordTooShort: "Das Passwort muss mindestens 6 Zeichen lang sein",
    passwordTooLong: "Das Passwort darf höchstens 128 Zeichen lang sein",
    passwordLoginDisabled: "Passwort-Anmeldung ist deaktiviert",
    invalidEmailOrPassword: "E-Mail oder Passwort ist falsch",
    accountDisabled: "Das Konto ist deaktiviert",
    newPasswordTooShort: "Das neue Passwort muss mindestens 8 Zeichen lang sein",
    newPasswordTooLong: "Das neue Passwort darf höchstens 128 Zeichen lang sein",
    currentPasswordTooLong: "Das aktuelle Passwort darf höchstens 128 Zeichen lang sein",
    authenticationRequired: "Anmeldung erforderlich",
    currentPasswordRequired: "Bitte geben Sie das aktuelle Passwort ein",
    currentPasswordIncorrect: "Das aktuelle Passwort ist falsch",
    emailCodeCooldown: "Bestätigungscodes werden zu häufig gesendet. Bitte versuchen Sie es später erneut.",
    captchaRequired: "Bitte geben Sie den Bestätigungscode ein",
    captchaExpired: "Der Bestätigungscode ist abgelaufen. Bitte aktualisieren Sie und versuchen Sie es erneut.",
    captchaInvalidSession: "Bestätigung fehlgeschlagen. Bitte aktualisieren Sie und versuchen Sie es erneut.",
    captchaIncorrect: "Falscher Bestätigungscode. Bitte versuchen Sie es erneut.",
    emailVerificationRequired: "Bitte geben Sie den E-Mail-Bestätigungscode ein",
    emailVerificationExpired: "Der E-Mail-Bestätigungscode ist abgelaufen. Bitte fordern Sie einen neuen an.",
    emailVerificationInvalidSession: "E-Mail-Bestätigung fehlgeschlagen. Bitte fordern Sie einen neuen Code an.",
    emailVerificationIncorrect: "Falscher E-Mail-Bestätigungscode. Bitte versuchen Sie es erneut.",
  },
};

function authText(locale: AppLocale | undefined, key: keyof typeof authMessages.en) {
  return localizedText(authMessages, locale, key);
}

interface AdminLoginCaptchaRecord {
  code: string;
  tracker: string;
}

interface RegistrationEmailVerificationRecord {
  code: string;
  email: string;
  tracker: string;
  attempts: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly redis: RedisService,
    private readonly smtp: SmtpService,
    private readonly advancedAccess: AdvancedAccessService,
  ) {}

  async getAuthConfig(locale: AppLocale = DEFAULT_LOCALE) {
    const [
      passwordLoginEnabled,
      registrationEnabled,
      emailVerificationEnabled,
      providers,
    ] =
      await Promise.all([
        this.booleanSetting(AUTH_PASSWORD_LOGIN_KEY, true),
        this.booleanSetting(AUTH_REGISTRATION_KEY, true),
        this.registrationEmailVerificationEnabled(),
        this.prisma.oAuthProviderConfig.findMany({
          where: {
            isActive: true,
            clientId: { not: "" },
          },
          orderBy: { provider: "asc" },
          select: { provider: true, clientId: true },
        }),
      ]);

    return {
      passwordLoginEnabled,
      registrationEnabled,
      registrationEmailVerificationEnabled: emailVerificationEnabled,
      registrationDisabledMessage: authText(locale, "registrationDisabled"),
      oauthProviders: providers.map((p) => p.provider.toLowerCase()),
      oauthProviderClientIds: Object.fromEntries(
        providers.map((p) => [p.provider.toLowerCase(), p.clientId]),
      ),
    };
  }

  async assertOAuthEnabled(provider: OAuthProviderEnum, locale: AppLocale = DEFAULT_LOCALE) {
    const row = await this.prisma.oAuthProviderConfig.findUnique({
      where: { provider },
    });
    if (!row?.isActive || !row.clientId) {
      throw new ForbiddenException(authText(locale, "oauthProviderDisabled"));
    }
  }

  async register(input: {
    email: string;
    password: string;
    emailVerificationCode?: unknown;
    emailVerificationId?: unknown;
    emailVerificationTracker?: string;
    locale?: AppLocale;
    localeSource?: "device" | "explicit";
  }) {
    const locale = input.locale ?? DEFAULT_LOCALE;
    const registrationEnabled = await this.booleanSetting(
      AUTH_REGISTRATION_KEY,
      true,
    );
    if (!registrationEnabled) {
      throw new ForbiddenException(authText(locale, "registrationDisabled"));
    }

    const email = this.normalizeEmail(input.email);
    if (!email) {
      throw new BadRequestException(authText(locale, "emailRequired"));
    }
    const existing = await this.prisma.user.findUnique({
      where: { email },
    });
    if (existing) throw new ConflictException(authText(locale, "emailInUse"));
    if (await this.registrationEmailVerificationEnabled()) {
      await this.verifyRegistrationEmailCode(
        email,
        input.emailVerificationId,
        input.emailVerificationCode,
        input.emailVerificationTracker,
        locale,
      );
    }
    if (input.password.length < 6)
      throw new BadRequestException(authText(locale, "passwordTooShort"));
    if (input.password.length > 128)
      throw new BadRequestException(authText(locale, "passwordTooLong"));
    const passwordHash = await argon2.hash(input.password);
    const userRole = await this.prisma.role.findUnique({
      where: { code: "USER" },
    });
    const signupCredits = await this.defaultRegistrationCredits();
    const displayName = this.displayNameFromEmail(email);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          profile: {
            create: {
              displayName,
              locale,
              localeSource: input.localeSource ?? "device",
              localeUpdatedAt: input.localeSource === "explicit" ? new Date() : undefined,
              credits: signupCredits,
            },
          },
          userRoles: userRole ? { create: [{ roleId: userRole.id }] } : undefined,
        },
      });
      if (signupCredits > 0) {
        await tx.creditLedger.create({
          data: {
            userId: user.id,
            delta: signupCredits,
            balanceAfter: signupCredits,
            reason: "Registration bonus",
            refType: "SIGNUP",
          },
        });
      }
      return user;
    });
  }

  async loginWithPassword(email: string, password: string, locale: AppLocale = DEFAULT_LOCALE) {
    const passwordLoginEnabled = await this.booleanSetting(
      AUTH_PASSWORD_LOGIN_KEY,
      true,
    );
    if (!passwordLoginEnabled) {
      throw new ForbiddenException(authText(locale, "passwordLoginDisabled"));
    }
    return this.verifyPasswordUser(this.normalizeEmail(email), password, locale);
  }

  async issueRegistrationEmailVerification(email: string, tracker: string, locale: AppLocale = DEFAULT_LOCALE) {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) {
      throw new BadRequestException(authText(locale, "emailRequired"));
    }
    const registrationEnabled = await this.booleanSetting(AUTH_REGISTRATION_KEY, true);
    if (!registrationEnabled) {
      throw new ForbiddenException(authText(locale, "registrationDisabled"));
    }
    if (!(await this.registrationEmailVerificationEnabled())) {
      return { ok: true, required: false, expiresInSeconds: 0, resendAfterSeconds: 0 };
    }
    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) throw new ConflictException(authText(locale, "emailInUse"));

    const cooldownKey = this.registrationEmailCooldownKey(normalizedEmail, tracker);
    const coolingDown = await this.redis.client.get(cooldownKey);
    if (coolingDown) {
      throw new BadRequestException(authText(locale, "emailCodeCooldown"));
    }

    const verificationId = randomId(24);
    const code = this.generateEmailVerificationCode();
    const payload: RegistrationEmailVerificationRecord = {
      code,
      email: normalizedEmail,
      tracker,
      attempts: 0,
    };

    await this.smtp.sendRegistrationCode(normalizedEmail, code, locale);
    await this.redis.client.set(
      this.registrationEmailVerificationKey(verificationId),
      JSON.stringify(payload),
      "EX",
      EMAIL_VERIFICATION_TTL_SECONDS,
    );
    await this.redis.client.set(
      cooldownKey,
      "1",
      "EX",
      EMAIL_VERIFICATION_RESEND_SECONDS,
    );

    return {
      ok: true,
      required: true,
      emailVerificationId: verificationId,
      expiresInSeconds: EMAIL_VERIFICATION_TTL_SECONDS,
      resendAfterSeconds: EMAIL_VERIFICATION_RESEND_SECONDS,
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string | undefined,
    newPassword: string,
    locale: AppLocale = DEFAULT_LOCALE,
  ) {
    if (newPassword.length < 8) {
      throw new BadRequestException(authText(locale, "newPasswordTooShort"));
    }
    if (newPassword.length > 128) {
      throw new BadRequestException(authText(locale, "newPasswordTooLong"));
    }
    if (currentPassword && currentPassword.length > 128) {
      throw new BadRequestException(authText(locale, "currentPasswordTooLong"));
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException(authText(locale, "authenticationRequired"));
    if (user.passwordHash) {
      if (!currentPassword) throw new BadRequestException(authText(locale, "currentPasswordRequired"));
      const ok = await argon2.verify(user.passwordHash, currentPassword);
      if (!ok) throw new UnauthorizedException(authText(locale, "currentPasswordIncorrect"));
    }
    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { ok: true };
  }

  async adminLoginWithPassword(email: string, password: string, locale: AppLocale = DEFAULT_LOCALE) {
    return this.verifyPasswordUser(this.normalizeEmail(email), password, locale);
  }

  async issueAdminLoginCaptcha(tracker: string) {
    const captchaId = randomId(24);
    const code = this.generateAdminLoginCaptchaCode();
    const payload: AdminLoginCaptchaRecord = { code, tracker };

    await this.redis.client.set(
      this.adminLoginCaptchaKey(captchaId),
      JSON.stringify(payload),
      "EX",
      ADMIN_LOGIN_CAPTCHA_TTL_SECONDS,
    );

    return {
      captchaId,
      imageDataUrl: this.captchaDataUrl(code, "admin login captcha"),
      expiresInSeconds: ADMIN_LOGIN_CAPTCHA_TTL_SECONDS,
    };
  }

  async verifyAdminLoginCaptcha(
    captchaId: string,
    captchaCode: string,
    tracker: string,
    locale: AppLocale = DEFAULT_LOCALE,
  ) {
    if (!captchaId.trim() || !captchaCode.trim()) {
      throw new BadRequestException(authText(locale, "captchaRequired"));
    }

    const raw = await this.redis.client.getdel(this.adminLoginCaptchaKey(captchaId.trim()));
    if (!raw) {
      throw new BadRequestException(authText(locale, "captchaExpired"));
    }

    const payload = JSON.parse(raw) as Partial<AdminLoginCaptchaRecord>;
    if (
      typeof payload.code !== "string" ||
      typeof payload.tracker !== "string" ||
      payload.tracker !== tracker
    ) {
      throw new BadRequestException(authText(locale, "captchaInvalidSession"));
    }

    if (this.normalizeSignupCaptcha(payload.code) !== this.normalizeSignupCaptcha(captchaCode)) {
      throw new BadRequestException(authText(locale, "captchaIncorrect"));
    }
  }

  private async verifyPasswordUser(email: string, password: string, locale: AppLocale) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException(authText(locale, "invalidEmailOrPassword"));
    }
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) throw new UnauthorizedException(authText(locale, "invalidEmailOrPassword"));
    if (user.status !== "ACTIVE")
      throw new UnauthorizedException(authText(locale, "accountDisabled"));
    return user;
  }

  private async booleanSetting(key: string, defaultValue: boolean) {
    const setting = await this.prisma.siteSetting
      .findUnique({ where: { key } })
      .catch(() => null);
    if (!setting) return defaultValue;
    const value = setting.value;
    if (typeof value === "boolean") return value;
    if (value && typeof value === "object" && "enabled" in value) {
      return (value as { enabled?: unknown }).enabled !== false;
    }
    return defaultValue;
  }

  private async defaultRegistrationCredits() {
    const setting = await this.prisma.siteSetting
      .findUnique({ where: { key: AUTH_DEFAULT_REGISTRATION_CREDITS_KEY } })
      .catch(() => null);
    if (!setting) return 0;
    return readDefaultRegistrationCredits(setting.value) ?? 0;
  }

  private async registrationEmailVerificationEnabled() {
    return this.smtp.isRegistrationVerificationEnabled();
  }

  private adminLoginCaptchaKey(captchaId: string) {
    return `mg:admin:login-captcha:${captchaId}`;
  }

  private generateAdminLoginCaptchaCode() {
    return Array.from({ length: ADMIN_LOGIN_CAPTCHA_LENGTH }, () =>
      CAPTCHA_CHARSET[randomInt(0, CAPTCHA_CHARSET.length)],
    ).join("");
  }

  private generateEmailVerificationCode() {
    return String(randomInt(0, 1_000_000)).padStart(EMAIL_VERIFICATION_LENGTH, "0");
  }

  private async verifyRegistrationEmailCode(
    email: string,
    verificationId: unknown,
    code: unknown,
    tracker: string | undefined,
    locale: AppLocale,
  ) {
    if (
      typeof verificationId !== "string" ||
      typeof code !== "string" ||
      !verificationId.trim() ||
      !code.trim()
    ) {
      throw new BadRequestException(authText(locale, "emailVerificationRequired"));
    }

    const key = this.registrationEmailVerificationKey(verificationId.trim());
    const raw = await this.redis.client.get(key);
    if (!raw) {
      throw new BadRequestException(authText(locale, "emailVerificationExpired"));
    }

    const payload = JSON.parse(raw) as Partial<RegistrationEmailVerificationRecord>;
    const normalizedEmail = this.normalizeEmail(email);
    const expectedTracker = tracker ?? "";
    if (
      typeof payload.code !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.tracker !== "string" ||
      payload.email !== normalizedEmail ||
      payload.tracker !== expectedTracker
    ) {
      await this.redis.client.del(key);
      throw new BadRequestException(authText(locale, "emailVerificationInvalidSession"));
    }

    if (this.normalizeSignupCaptcha(payload.code) !== this.normalizeSignupCaptcha(code)) {
      const attempts = Number(payload.attempts ?? 0) + 1;
      if (attempts >= 5) {
        await this.redis.client.del(key);
      } else {
        await this.redis.client.set(
          key,
          JSON.stringify({ ...payload, attempts }),
          "EX",
          EMAIL_VERIFICATION_TTL_SECONDS,
        );
      }
      throw new BadRequestException(authText(locale, "emailVerificationIncorrect"));
    }

    await this.redis.client.del(key);
  }

  private normalizeSignupCaptcha(value: string) {
    return value.trim().toUpperCase();
  }

  private normalizeEmail(value: string) {
    return value.trim().toLowerCase();
  }

  private displayNameFromEmail(email: string) {
    const prefix = email.split("@")[0]?.replace(/[\u0000-\u001F\u007F]/g, "").trim();
    return prefix ? prefix.slice(0, 191) : "Creator";
  }

  private registrationEmailVerificationKey(verificationId: string) {
    return `mg:auth:registration-email-verification:${verificationId}`;
  }

  private registrationEmailCooldownKey(email: string, tracker: string) {
    return `mg:auth:registration-email-verification-cooldown:${this.normalizeEmail(email)}:${tracker}`;
  }

  private captchaDataUrl(code: string, label: string) {
    const svg = this.renderCaptchaSvg(code, label);
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  }

  private renderCaptchaSvg(code: string, label: string) {
    const width = 148;
    const height = 52;
    const chars = code
      .split("")
      .map((char, index) => {
        const x = 18 + index * 24 + randomInt(0, 5);
        const y = 31 + randomInt(0, 9);
        const rotation = randomInt(0, 31) - 15;
        const fontSize = 22 + randomInt(0, 5);
        const fill = index % 2 === 0 ? "#1f2937" : "#312e81";
        return `<text x="${x}" y="${y}" font-size="${fontSize}" font-family="Arial, sans-serif" font-weight="700" fill="${fill}" transform="rotate(${rotation} ${x} ${y})">${char}</text>`;
      })
      .join("");

    const lines = Array.from({ length: 4 }, () => {
      const startX = randomInt(0, 24);
      const startY = randomInt(8, height - 8);
      const midX = randomInt(32, width - 32);
      const midY = randomInt(6, height - 6);
      const endX = randomInt(width - 28, width);
      const endY = randomInt(8, height - 8);
      const color = randomInt(0, 2) === 0 ? "#94a3b8" : "#c4b5fd";
      return `<path d="M${startX} ${startY} Q ${midX} ${midY} ${endX} ${endY}" stroke="${color}" stroke-width="1.8" fill="none" stroke-linecap="round" opacity="0.9" />`;
    }).join("");

    const dots = Array.from({ length: 20 }, () => {
      const cx = randomInt(6, width - 6);
      const cy = randomInt(6, height - 6);
      const radius = randomInt(1, 3);
      const fill = randomInt(0, 2) === 0 ? "#d8b4fe" : "#93c5fd";
      return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" opacity="0.8" />`;
    }).join("");

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}"><rect width="${width}" height="${height}" rx="12" fill="#f8fafc" /><rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="11" fill="none" stroke="#cbd5e1" />${dots}${lines}${chars}</svg>`;
  }

  async issueSession(res: Response, userId: string) {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });
    const isSuperAdmin = userRoles.some((r) => r.role.code === "SUPER_ADMIN");
    await this.sessions.issue(res, { userId, isSuperAdmin });
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
    return { userId, isSuperAdmin };
  }

  async revokeSession(jti: string, res: Response) {
    await this.sessions.revoke(jti);
    this.sessions.clearCookie(res);
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        userRoles: { include: { role: true } },
      },
    });
    if (!user) return null;
    const isSuperAdmin = user.userRoles.some(
      (r) => r.role.code === "SUPER_ADMIN",
    );
    return {
      id: user.id,
      email: user.email,
      displayName: user.profile?.displayName ?? user.email.split("@")[0],
      avatarUrl: user.profile?.avatarUrl ?? null,
      locale: user.profile?.locale ?? DEFAULT_LOCALE,
      localeSource: user.profile?.localeSource ?? "device",
      localeUpdatedAt: user.profile?.localeUpdatedAt ?? null,
      role: isSuperAdmin ? "SUPER_ADMIN" : "USER",
      isSuperAdmin,
      credits: user.profile?.credits ?? 0,
      hasAdvancedAccess: await this.advancedAccess.hasAdvancedAccess(user.id),
    };
  }
}
