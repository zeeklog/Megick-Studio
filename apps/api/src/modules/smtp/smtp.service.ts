import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "nestjs-prisma";
import * as nodemailer from "nodemailer";
import { CryptoService } from "@/common/services/crypto.service";
import { DEFAULT_LOCALE, FALLBACK_LOCALE, type AppLocale } from "@/common/locale";

const SMTP_CONFIG_NAME = "default";
const KEEP_EXISTING = "__KEEP_EXISTING__";

function registrationEmailCopy(locale: AppLocale) {
  const htmlLang = locale === "zh-CN" ? "zh-CN" : locale === "zh-TW" ? "zh-TW" : FALLBACK_LOCALE;
  if (htmlLang === FALLBACK_LOCALE) {
    return {
      subject: (code: string) => `Megick registration code: ${code}`,
      text: (code: string) => [
        `Your Megick registration code is ${code}.`,
        "The code expires in 10 minutes. If you did not request it, you can ignore this email.",
      ],
      htmlLang,
      title: "Megick registration code",
      headerLabel: "Account verification",
      badge: "Registration verification",
      heading: "Verify your Megick account",
      intro: (email: string) =>
        `We received a request to register Megick with <strong style="color:#111827;font-weight:700;">${email}</strong>. Enter the code below on the registration page to finish verification.`,
      validTitle: "Valid for 10 minutes",
      security:
        "To keep your account safe, do not forward or share this code. Megick staff will never ask for it.",
      ignore:
        "If you did not start this registration request, you can safely ignore this email. The code will expire automatically.",
    };
  }
  if (htmlLang === "zh-TW") {
    return {
      subject: (code: string) => `Megick 註冊驗證碼：${code}`,
      text: (code: string) => [
        `您的 Megick 註冊驗證碼是 ${code}。`,
        "驗證碼將在 10 分鐘後失效。若非本人操作，請忽略本郵件。",
      ],
      htmlLang,
      title: "Megick 註冊驗證碼",
      headerLabel: "帳戶驗證",
      badge: "Registration verification",
      heading: "驗證您的 Megick 帳戶",
      intro: (email: string) =>
        `我們收到了使用 <strong style="color:#111827;font-weight:700;">${email}</strong> 註冊 Megick 的請求。請在註冊頁面輸入以下驗證碼完成驗證。`,
      validTitle: "10 分鐘內有效",
      security:
        "為了保護帳戶安全，請勿向任何人轉寄或透露此驗證碼。Megick 工作人員不會向您索取驗證碼。",
      ignore: "若您沒有發起註冊請求，可以安全忽略本郵件；該驗證碼會自動失效。",
    };
  }
  return {
    subject: (code: string) => `Megick 注册验证码：${code}`,
    text: (code: string) => [
      `您的 Megick 注册验证码是 ${code}。`,
      "验证码将在 10 分钟后失效。若非本人操作，请忽略本邮件。",
    ],
    htmlLang,
    title: "Megick 注册验证码",
    headerLabel: "账户验证",
    badge: "Registration verification",
    heading: "验证您的 Megick 账户",
    intro: (email: string) =>
      `我们收到了使用 <strong style="color:#111827;font-weight:700;">${email}</strong> 注册 Megick 的请求。请在注册页面输入以下验证码完成验证。`,
    validTitle: "10 分钟内有效",
    security:
      "为了保护账户安全，请勿向任何人转发或透露此验证码。Megick 工作人员不会向您索要验证码。",
    ignore: "若您没有发起注册请求，可以安全忽略本邮件；该验证码会自动失效。",
  };
}

function creditEmailCopy(locale: AppLocale, isGrant: boolean) {
  const htmlLang = locale === "zh-CN" ? "zh-CN" : locale === "zh-TW" ? "zh-TW" : FALLBACK_LOCALE;
  if (htmlLang === FALLBACK_LOCALE) {
    return {
      direction: isGrant ? "added" : "deducted",
      directionNoun: isGrant ? "Credit grant" : "Credit adjustment",
      title: isGrant ? "Credits added" : "Credits adjusted",
      subject: (signedDelta: string) => `Megick credit ${isGrant ? "grant" : "adjustment"} notice: ${signedDelta} credits`,
      textGreeting: (name: string) => `Hi ${name},`,
      textChange: (amount: number) => `Your Megick account credits were ${isGrant ? "increased by" : "decreased by"} ${amount} credits.`,
      textBalance: (balance: number) => `Current credit balance: ${balance}`,
      textReason: (reason: string) => `Reason: ${reason}`,
      textSupport: "If you have questions, please contact Megick support.",
      htmlLang,
      htmlTitle: `Megick credit ${isGrant ? "grant" : "adjustment"} notice`,
      hiddenPreview: (amount: number, balance: number) =>
        `Your Megick account credits were ${isGrant ? "increased by" : "decreased by"} ${amount} credits. Current balance: ${balance}.`,
      headerLabel: "Account credit notice",
      intro: (name: string, email: string) =>
        `${name}, Megick has completed this credit ${isGrant ? "grant" : "adjustment"}. This email was sent to <strong style="color:#111827;font-weight:700;">${email}</strong>.`,
      changeLabel: "This change",
      balanceLabel: "Current credit balance",
      typeLabel: "Change type",
      emailLabel: "Notification email",
      reasonLabel: "Adjustment reason",
      footer:
        "If you have questions about this credit adjustment, please contact Megick support. This email was sent automatically; please do not reply.",
    };
  }
  if (htmlLang === "zh-TW") {
    return {
      direction: isGrant ? "發放" : "扣除",
      directionNoun: isGrant ? "積分發放" : "積分調整",
      title: isGrant ? "積分已到帳" : "積分已調整",
      subject: (signedDelta: string) => `Megick 積分${isGrant ? "發放" : "扣除"}通知：${signedDelta} 積分`,
      textGreeting: (name: string) => `${name}，您好：`,
      textChange: (amount: number) => `您的 Megick 帳戶積分已${isGrant ? "發放" : "扣除"} ${amount} 積分。`,
      textBalance: (balance: number) => `目前積分餘額：${balance}`,
      textReason: (reason: string) => `原因：${reason}`,
      textSupport: "如有疑問，請聯絡 Megick 支援團隊。",
      htmlLang,
      htmlTitle: `Megick 積分${isGrant ? "發放" : "扣除"}通知`,
      hiddenPreview: (amount: number, balance: number) =>
        `您的 Megick 帳戶積分已${isGrant ? "發放" : "扣除"} ${amount} 積分，目前餘額 ${balance}。`,
      headerLabel: "帳戶積分通知",
      intro: (name: string, email: string) =>
        `${name}，Megick 已完成本次積分${isGrant ? "發放" : "扣除"}。這封郵件發送至 <strong style="color:#111827;font-weight:700;">${email}</strong>。`,
      changeLabel: "本次變動",
      balanceLabel: "目前積分餘額",
      typeLabel: "變動類型",
      emailLabel: "通知信箱",
      reasonLabel: "調整原因",
      footer: "如您對本次積分調整有疑問，請聯絡 Megick 支援團隊。此郵件為系統自動發送，請勿直接回覆。",
    };
  }
  return {
    direction: isGrant ? "发放" : "扣除",
    directionNoun: isGrant ? "积分发放" : "积分调整",
    title: isGrant ? "积分已到账" : "积分已调整",
    subject: (signedDelta: string) => `Megick 积分${isGrant ? "发放" : "扣除"}通知：${signedDelta} 积分`,
    textGreeting: (name: string) => `${name}，您好：`,
    textChange: (amount: number) => `您的 Megick 账户积分已${isGrant ? "发放" : "扣除"} ${amount} 积分。`,
    textBalance: (balance: number) => `当前积分余额：${balance}`,
    textReason: (reason: string) => `原因：${reason}`,
    textSupport: "如有疑问，请联系 Megick 支持团队。",
    htmlLang,
    htmlTitle: `Megick 积分${isGrant ? "发放" : "扣除"}通知`,
    hiddenPreview: (amount: number, balance: number) =>
      `您的 Megick 账户积分已${isGrant ? "发放" : "扣除"} ${amount} 积分，当前余额 ${balance}。`,
    headerLabel: "账户积分通知",
    intro: (name: string, email: string) =>
      `${name}，Megick 已完成本次积分${isGrant ? "发放" : "扣除"}。这封邮件发送至 <strong style="color:#111827;font-weight:700;">${email}</strong>。`,
    changeLabel: "本次变动",
    balanceLabel: "当前积分余额",
    typeLabel: "变动类型",
    emailLabel: "通知邮箱",
    reasonLabel: "调整原因",
    footer: "如您对本次积分调整有疑问，请联系 Megick 支持团队。此邮件为系统自动发送，请勿直接回复。",
  };
}

export interface SmtpConfigInput {
  host?: unknown;
  port?: unknown;
  secure?: unknown;
  username?: unknown;
  password?: unknown;
  fromEmail?: unknown;
  fromName?: unknown;
  replyTo?: unknown;
  requireTls?: unknown;
  rejectUnauthorized?: unknown;
}

interface SmtpConfig extends Record<string, unknown> {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  requireTls: boolean;
  rejectUnauthorized: boolean;
}

@Injectable()
export class SmtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
  ) {}

  async getSummary() {
    const row = await this.prisma.smtpConfig.findUnique({ where: { name: SMTP_CONFIG_NAME } });
    const config = row?.configEnc ? this.decryptConfig(row.configEnc) : this.envFallback();
    const missingKeys = this.missingKeys(config);
    return {
      id: row?.id ?? SMTP_CONFIG_NAME,
      isActive: row?.isActive ?? this.envFallbackIsActive(config),
      hasConfig: missingKeys.length === 0,
      missingKeys,
      configuredKeys: this.configuredKeys(config),
      config: this.maskConfig(config),
    };
  }

  async isRegistrationVerificationEnabled() {
    const summary = await this.getSummary();
    return summary.isActive && summary.hasConfig;
  }

  async upsert(input: SmtpConfigInput, isActive = false) {
    const existing = await this.prisma.smtpConfig.findUnique({ where: { name: SMTP_CONFIG_NAME } });
    const previous = existing?.configEnc ? this.decryptConfig(existing.configEnc) : {};
    const normalized = this.normalizeConfig(input, previous);
    const missing = this.missingKeys(normalized);
    if (isActive && missing.length > 0) {
      throw new BadRequestException(`SMTP config missing required keys: ${missing.join(", ")}`);
    }
    const configEnc = this.crypto.encrypt(JSON.stringify(normalized));
    await this.prisma.smtpConfig.upsert({
      where: { name: SMTP_CONFIG_NAME },
      update: { configEnc, isActive },
      create: { name: SMTP_CONFIG_NAME, configEnc, isActive },
    });
    return this.getSummary();
  }

  async sendTestEmail(to: string) {
    await this.sendMail({
      to,
      subject: "Megick SMTP test",
      text: "This is a test email from Megick SMTP settings.",
      html: "<p>This is a test email from Megick SMTP settings.</p>",
    });
    return { ok: true };
  }

  async sendRegistrationCode(to: string, code: string, locale: AppLocale = DEFAULT_LOCALE) {
    const copy = registrationEmailCopy(locale);
    await this.sendMail({
      to,
      subject: copy.subject(code),
      text: copy.text(code).join("\n"),
      html: this.buildRegistrationCodeEmailHtml(to, code, locale),
    });
  }

  async sendCreditAdjustmentNotification(input: {
    to: string;
    displayName: string;
    delta: number;
    balanceAfter: number;
    reason: string;
    locale?: AppLocale;
  }) {
    const locale = input.locale ?? DEFAULT_LOCALE;
    const isGrant = input.delta >= 0;
    const copy = creditEmailCopy(locale, isGrant);
    const signedDelta = `${input.delta >= 0 ? "+" : ""}${input.delta}`;
    await this.sendMail({
      to: input.to,
      subject: copy.subject(signedDelta),
      text: [
        copy.textGreeting(input.displayName),
        copy.textChange(Math.abs(input.delta)),
        copy.textBalance(input.balanceAfter),
        copy.textReason(input.reason),
        copy.textSupport,
      ].join("\n"),
      html: this.buildCreditAdjustmentEmailHtml(input),
    });
  }

  private buildRegistrationCodeEmailHtml(to: string, code: string, locale: AppLocale = DEFAULT_LOCALE) {
    const copy = registrationEmailCopy(locale);
    const escapedCode = this.escapeHtml(code);
    const escapedEmail = this.escapeHtml(to);
    return `<!doctype html>
<html lang="${copy.htmlLang}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${copy.title}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;color:#172033;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f4f7fb;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:36px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;border-collapse:collapse;">
            <tr>
              <td style="padding:0 0 18px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="left" style="font-size:0;">
                      <span style="display:inline-block;width:42px;height:42px;border-radius:14px;background:#111827;color:#ffffff;text-align:center;font-size:20px;line-height:42px;font-weight:800;vertical-align:middle;">M</span>
                      <span style="display:inline-block;padding-left:12px;color:#111827;font-size:20px;line-height:42px;font-weight:800;vertical-align:middle;">Megick</span>
                    </td>
                    <td align="right" style="color:#60708a;font-size:13px;line-height:20px;">${copy.headerLabel}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;overflow:hidden;box-shadow:0 18px 48px rgba(15,23,42,0.10);">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="height:8px;background:#2563eb;font-size:0;line-height:0;">&nbsp;</td>
                  </tr>
                  <tr>
                    <td style="padding:40px 40px 18px 40px;">
                      <div style="display:inline-block;padding:7px 12px;border-radius:999px;background:#eef6ff;color:#1d4ed8;font-size:13px;line-height:18px;font-weight:700;">${copy.badge}</div>
                      <h1 style="margin:22px 0 10px 0;color:#111827;font-size:28px;line-height:36px;font-weight:800;letter-spacing:0;">${copy.heading}</h1>
                      <p style="margin:0;color:#475569;font-size:16px;line-height:26px;">${copy.intro(escapedEmail)}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 40px 8px 40px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:separate;border-spacing:0;">
                        <tr>
                          <td align="center" style="background:#0f172a;border-radius:20px;border:1px solid #1e293b;padding:28px 16px;">
                            <div style="color:#93a4bd;font-size:13px;line-height:18px;font-weight:700;text-transform:uppercase;">Verification code</div>
                            <div style="margin-top:10px;color:#ffffff;font-size:38px;line-height:46px;font-weight:800;letter-spacing:8px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;word-break:break-all;">${escapedCode}</div>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 40px 0 40px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;">
                        <tr>
                          <td width="42" valign="top" style="padding:18px 0 18px 18px;">
                            <div style="width:30px;height:30px;border-radius:10px;background:#dcfce7;color:#047857;text-align:center;font-size:18px;line-height:30px;font-weight:800;">✓</div>
                          </td>
                          <td style="padding:18px 18px 18px 12px;color:#475569;font-size:14px;line-height:22px;">
                            <strong style="display:block;color:#111827;font-size:15px;line-height:22px;margin-bottom:2px;">${copy.validTitle}</strong>
                            ${copy.security}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:26px 40px 38px 40px;color:#64748b;font-size:14px;line-height:24px;">
                      ${copy.ignore}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:22px 10px 0 10px;color:#7c8ca5;font-size:12px;line-height:20px;">
                © Megick AI Creations. This is an automated message, please do not reply.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  private buildCreditAdjustmentEmailHtml(input: {
    to: string;
    displayName: string;
    delta: number;
    balanceAfter: number;
    reason: string;
    locale?: AppLocale;
  }) {
    const escapedName = this.escapeHtml(input.displayName || input.to);
    const escapedEmail = this.escapeHtml(input.to);
    const escapedReason = this.escapeHtml(input.reason);
    const isGrant = input.delta >= 0;
    const copy = creditEmailCopy(input.locale ?? DEFAULT_LOCALE, isGrant);
    const signedDelta = `${isGrant ? "+" : ""}${input.delta}`;
    const amountColor = isGrant ? "#047857" : "#b91c1c";
    const accentBg = isGrant ? "#ecfdf5" : "#fef2f2";
    const accentBorder = isGrant ? "#bbf7d0" : "#fecaca";

    return `<!doctype html>
<html lang="${copy.htmlLang}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${copy.htmlTitle}</title>
  </head>
  <body style="margin:0;padding:0;background:#f6f7f9;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;color:#111827;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${copy.hiddenPreview(Math.abs(input.delta), input.balanceAfter)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f6f7f9;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;">
            <tr>
              <td style="padding:0 4px 18px 4px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="left" style="font-size:0;">
                      <span style="display:inline-block;width:36px;height:36px;border-radius:12px;background:#111827;color:#ffffff;text-align:center;font-size:18px;line-height:36px;font-weight:800;vertical-align:middle;">M</span>
                      <span style="display:inline-block;padding-left:10px;color:#111827;font-size:18px;line-height:36px;font-weight:800;vertical-align:middle;">Megick</span>
                    </td>
                    <td align="right" style="color:#6b7280;font-size:13px;line-height:20px;">${copy.headerLabel}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="padding:32px 32px 10px 32px;">
                      <div style="display:inline-block;padding:6px 10px;border-radius:999px;background:${accentBg};border:1px solid ${accentBorder};color:${amountColor};font-size:13px;line-height:18px;font-weight:700;">${copy.directionNoun}</div>
                      <h1 style="margin:18px 0 8px 0;color:#111827;font-size:28px;line-height:36px;font-weight:800;letter-spacing:0;">${copy.title}</h1>
                      <p style="margin:0;color:#4b5563;font-size:15px;line-height:25px;">${copy.intro(escapedName, escapedEmail)}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 32px 6px 32px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#fafafa;border:1px solid #eeeeee;border-radius:16px;border-collapse:separate;border-spacing:0;">
                        <tr>
                          <td style="padding:24px 24px 10px 24px;">
                            <div style="color:#6b7280;font-size:13px;line-height:18px;font-weight:700;">${copy.changeLabel}</div>
                            <div style="margin-top:8px;color:${amountColor};font-size:44px;line-height:52px;font-weight:800;letter-spacing:0;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;">${signedDelta}</div>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:0 24px 24px 24px;color:#6b7280;font-size:14px;line-height:22px;">${copy.balanceLabel} <strong style="color:#111827;font-size:16px;font-weight:800;">${input.balanceAfter}</strong></td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 32px 0 32px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e5e7eb;border-radius:14px;border-collapse:separate;border-spacing:0;">
                        <tr>
                          <td width="120" style="padding:16px 18px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px;line-height:22px;">${copy.typeLabel}</td>
                          <td style="padding:16px 18px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;line-height:22px;font-weight:700;">${copy.direction}</td>
                        </tr>
                        <tr>
                          <td width="120" style="padding:16px 18px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:14px;line-height:22px;">${copy.emailLabel}</td>
                          <td style="padding:16px 18px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;line-height:22px;word-break:break-all;">${escapedEmail}</td>
                        </tr>
                        <tr>
                          <td width="120" valign="top" style="padding:16px 18px;color:#6b7280;font-size:14px;line-height:22px;">${copy.reasonLabel}</td>
                          <td style="padding:16px 18px;color:#111827;font-size:14px;line-height:22px;">${escapedReason}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:24px 32px 34px 32px;color:#6b7280;font-size:13px;line-height:22px;">
                      ${copy.footer}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 10px 0 10px;color:#9ca3af;font-size:12px;line-height:20px;">
                © Megick AI Creations. This is an automated message, please do not reply.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  }

  private async sendMail(input: { to: string; subject: string; text: string; html: string }) {
    const config = await this.requireActiveConfig();
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.username ? { user: config.username, pass: config.password } : undefined,
      requireTLS: config.requireTls,
      tls: { rejectUnauthorized: config.rejectUnauthorized },
    });

    await transporter.sendMail({
      to: input.to,
      from: config.fromName
        ? { name: config.fromName, address: config.fromEmail }
        : config.fromEmail,
      replyTo: config.replyTo || undefined,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
  }

  private async requireActiveConfig() {
    const row = await this.prisma.smtpConfig.findUnique({ where: { name: SMTP_CONFIG_NAME } });
    const config = row?.configEnc ? this.decryptConfig(row.configEnc) : this.envFallback();
    const isActive = row?.isActive ?? this.envFallbackIsActive(config);
    if (!isActive) {
      throw new ServiceUnavailableException("SMTP is not enabled");
    }
    const missing = this.missingKeys(config);
    if (missing.length > 0) {
      throw new ServiceUnavailableException(`SMTP config missing required keys: ${missing.join(", ")}`);
    }
    return config as SmtpConfig;
  }

  private decryptConfig(configEnc: string) {
    try {
      return JSON.parse(this.crypto.decrypt(configEnc)) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  private normalizeConfig(input: SmtpConfigInput, previous: Record<string, unknown>) {
    const readPrevious = (key: keyof SmtpConfigInput) =>
      input[key] === undefined ? previous[key] : input[key];
    const password =
      input.password === KEEP_EXISTING ? previous.password : this.readString(readPrevious("password"));
    const port = Number(readPrevious("port"));
    const normalized: SmtpConfig = {
      host: this.readString(readPrevious("host")),
      port: Number.isInteger(port) && port > 0 ? port : 587,
      secure: this.readBoolean(readPrevious("secure")),
      username: this.readString(readPrevious("username")),
      password: this.readString(password),
      fromEmail: this.readString(readPrevious("fromEmail")),
      fromName: this.readString(readPrevious("fromName")),
      replyTo: this.readString(readPrevious("replyTo")),
      requireTls: this.readBoolean(readPrevious("requireTls")),
      rejectUnauthorized:
        readPrevious("rejectUnauthorized") === undefined
          ? true
          : this.readBoolean(readPrevious("rejectUnauthorized")),
    };
    return normalized;
  }

  private envFallback(): Partial<SmtpConfig> {
    return {
      host: this.config.get<string>("SMTP_HOST", ""),
      port: Number(this.config.get<string>("SMTP_PORT", "587")),
      secure: this.config.get<string>("SMTP_SECURE", "false").toLowerCase() === "true",
      username: this.config.get<string>("SMTP_USER", ""),
      password: this.config.get<string>("SMTP_PASSWORD", ""),
      fromEmail: this.config.get<string>("SMTP_FROM_EMAIL", ""),
      fromName: this.config.get<string>("SMTP_FROM_NAME", "Megick"),
      replyTo: this.config.get<string>("SMTP_REPLY_TO", ""),
      requireTls: this.config.get<string>("SMTP_REQUIRE_TLS", "false").toLowerCase() === "true",
      rejectUnauthorized:
        this.config.get<string>("SMTP_REJECT_UNAUTHORIZED", "true").toLowerCase() !== "false",
    };
  }

  private envFallbackIsActive(config: Partial<SmtpConfig>) {
    return Boolean(config.host && config.fromEmail);
  }

  private configuredKeys(config: Record<string, unknown>) {
    return Object.entries(config)
      .filter(([, value]) => {
        if (typeof value === "number") return Number.isFinite(value);
        if (typeof value === "boolean") return true;
        return typeof value === "string" && value.trim().length > 0;
      })
      .map(([key]) => key);
  }

  private missingKeys(config: Record<string, unknown>) {
    const missing = ["host", "fromEmail"].filter((key) => !this.hasText(config[key]));
    const port = Number(config.port);
    if (!Number.isInteger(port) || port <= 0) missing.push("port");
    if (this.hasText(config.username) && !this.hasText(config.password)) {
      missing.push("password");
    }
    if (this.hasText(config.password) && !this.hasText(config.username)) {
      missing.push("username");
    }
    return [...new Set(missing)];
  }

  private maskConfig(config: Record<string, unknown>) {
    return {
      ...config,
      password: this.hasText(config.password) ? KEEP_EXISTING : "",
    };
  }

  private readString(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
  }

  private readBoolean(value: unknown) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value.toLowerCase() === "true";
    return false;
  }

  private hasText(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
