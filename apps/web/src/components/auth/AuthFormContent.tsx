import { useEffect, useState, type FormEvent } from "react";
import { Apple, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api-client";
import { invalidateMe } from "@/hooks/useAuth";
import { useI18n } from "@/lib/i18n";
import { AUTH_CONFIG_QUERY_KEY, DEFAULT_AUTH_CONFIG } from "@/lib/auth-config";
import type { AuthConfigResponse } from "@megick/api-types";

type Tab = "signin" | "signup";
type OAuthProvider = "google" | "github" | "apple";

export interface AuthFormContentProps {
  mode: "signin" | "signup";
  redirectTo: string;
  onSuccess: () => void;
}

export function AuthFormContent({ mode, redirectTo, onSuccess }: AuthFormContentProps) {
  const { hasExplicitPreference, locale, t } = useI18n();
  const [tab, setTab] = useState<Tab>(mode);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailVerificationCode, setEmailVerificationCode] = useState("");
  const [emailVerificationId, setEmailVerificationId] = useState("");
  const [emailCodeSending, setEmailCodeSending] = useState(false);
  const [emailCodeCooldown, setEmailCodeCooldown] = useState(0);
  const queryClient = useQueryClient();
  const authConfigQ = useQuery({
    queryKey: AUTH_CONFIG_QUERY_KEY,
    queryFn: () => apiGet<AuthConfigResponse>("/api/auth/config"),
    enabled: true,
  });

  const authConfig = authConfigQ.data ?? DEFAULT_AUTH_CONFIG;
  const registrationDisabledMessage =
    authConfig.registrationDisabledMessage || t("auth.registrationDisabled");
  const oauthProviders = new Set<OAuthProvider>(authConfig.oauthProviders as OAuthProvider[]);
  const hasOAuth = authConfig.oauthProviders.length > 0;
  const showOAuth = (tab === "signin" || tab === "signup") && hasOAuth;
  const canUsePassword = authConfig.passwordLoginEnabled;
  const registrationClosed = tab === "signup" && !authConfig.registrationEnabled;
  const emailVerificationRequired =
    tab === "signup" && authConfig.registrationEmailVerificationEnabled;

  // Sync tab when mode changes (e.g., switching from signin to signup externally)
  useEffect(() => {
    setTab(mode);
  }, [mode]);

  // Cooldown timer for email verification code
  useEffect(() => {
    if (!emailCodeCooldown) return;
    const timer = window.setInterval(() => {
      setEmailCodeCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [emailCodeCooldown]);

  const oauthHref = (provider: "google" | "github" | "apple") => {
    const params = new URLSearchParams({ redirect: redirectTo });
    params.set("localeSource", hasExplicitPreference ? "explicit" : "device");
    if (hasExplicitPreference) params.set("locale", locale);
    return `/api/auth/${provider}?${params.toString()}`;
  };

  const oauthActions = showOAuth ? (
    <div className="space-y-3 pt-2">
      {canUsePassword ? (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-border" />
          <span>{t("auth.or")}</span>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-border" />
        </div>
      ) : null}
      <div className="flex gap-2">
        {oauthProviders.has("google") && (
          <Button
            asChild
            size="icon"
            variant="outline"
            className="h-11 flex-1 border-white/10 bg-background/55 hover:bg-secondary"
            aria-label={t("auth.continueGoogle")}
            title={t("auth.continueGoogle")}
          >
            <a href={oauthHref("google")}>
              <GoogleIcon />
            </a>
          </Button>
        )}
        {oauthProviders.has("github") && (
          <Button
            asChild
            size="icon"
            variant="outline"
            className="h-11 flex-1 border-white/10 bg-background/55 hover:bg-secondary"
            aria-label={t("auth.continueGithub")}
            title={t("auth.continueGithub")}
          >
            <a href={oauthHref("github")}>
              <GithubIcon />
            </a>
          </Button>
        )}
        {oauthProviders.has("apple") && (
          <Button
            asChild
            size="icon"
            variant="outline"
            className="h-11 flex-1 border-white/10 bg-background/55 hover:bg-secondary"
            aria-label={t("auth.continueApple")}
            title={t("auth.continueApple")}
          >
            <a href={oauthHref("apple")}>
              <Apple className="h-4 w-4" />
            </a>
          </Button>
        )}
      </div>
    </div>
  ) : null;

  const handleEmail = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (tab === "signup") {
        const payload: Record<string, string | undefined> = {
          email,
          password,
        };
        if (emailVerificationRequired) {
          payload.emailVerificationId = emailVerificationId || undefined;
          payload.emailVerificationCode = emailVerificationCode || undefined;
        }
        await apiPost("/api/auth/register", payload);
      } else {
        await apiPost("/api/auth/login", {
          email,
          password,
        });
      }
      await invalidateMe(queryClient);
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("auth.signInFailed");
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const sendEmailVerificationCode = async () => {
    if (!email.trim()) {
      toast.error(t("auth.emailRequired"));
      return;
    }
    setEmailCodeSending(true);
    try {
      const result = await apiPost<{
        ok: boolean;
        required: boolean;
        emailVerificationId?: string;
        resendAfterSeconds?: number;
      }>("/api/auth/registration-email-code", { email });
      setEmailVerificationCode("");
      setEmailVerificationId(result.emailVerificationId ?? "");
      setEmailCodeCooldown(result.resendAfterSeconds ?? 60);
      toast.success(t("auth.emailCodeSent"));
    } catch (err) {
      const message = err instanceof Error ? err.message : t("auth.emailCodeFailed");
      toast.error(message);
    } finally {
      setEmailCodeSending(false);
    }
  };

  return (
    <>
      <h2 className="text-center text-2xl font-semibold tracking-tight">
        {tab === "signup" ? t("auth.createAccount") : t("auth.welcomeBack")}
      </h2>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        {tab === "signup" ? t("auth.createSubtitle") : t("auth.signInSubtitle")}
      </p>

      <>
          {registrationClosed ? (
            <div className="rounded-2xl border border-border bg-secondary/50 p-4 text-sm text-muted-foreground">
              {registrationDisabledMessage}
            </div>
          ) : canUsePassword ? (
            <form onSubmit={handleEmail} className="mt-7 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailVerificationId("");
                    setEmailVerificationCode("");
                  }}
                  placeholder={t("auth.emailPlaceholder")}
                  required
                  className="border-white/10 bg-background/55 shadow-inner focus-visible:bg-background/70"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("auth.passwordPlaceholder")}
                  required
                  className="border-white/10 bg-background/55 shadow-inner focus-visible:bg-background/70"
                />
              </div>
              {emailVerificationRequired ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="email-code">{t("auth.emailCode")}</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground"
                      disabled={emailCodeSending || emailCodeCooldown > 0}
                      onClick={() => void sendEmailVerificationCode()}
                    >
                      {emailCodeSending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      {emailCodeCooldown > 0
                        ? t("auth.emailCodeCooldown", {
                            seconds: String(emailCodeCooldown),
                          })
                        : t("auth.sendEmailCode")}
                    </Button>
                  </div>
                  <InputOTP
                    id="email-code"
                    maxLength={6}
                    value={emailVerificationCode}
                    onChange={setEmailVerificationCode}
                    containerClassName="w-full justify-between"
                  >
                    <InputOTPGroup className="w-full">
                      {Array.from({ length: 6 }, (_, index) => (
                        <InputOTPSlot key={index} index={index} className="h-10 flex-1" />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                  <p className="text-xs text-muted-foreground">
                    {emailVerificationId
                      ? t("auth.emailCodeSentHelp")
                      : t("auth.emailCodeHelp")}
                  </p>
                </div>
              ) : null}
              <Button
                type="submit"
                disabled={
                  submitting ||
                  (tab === "signup" &&
                    emailVerificationRequired &&
                    (!emailVerificationId || emailVerificationCode.length !== 6))
                }
                size="lg"
                className="w-full bg-gradient-primary shadow-glow transition hover:-translate-y-0.5 hover:opacity-95"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : tab === "signup" ? (
                  t("auth.submitCreate")
                ) : (
                  t("auth.submitSignIn")
                )}
              </Button>
              {oauthActions}
            </form>
          ) : (
            <div className="mt-7 space-y-4">
              <div className="rounded-2xl border border-border bg-secondary/50 p-4 text-sm text-muted-foreground">
                {t("auth.passwordDisabled")}
              </div>
              {oauthActions}
            </div>
          )}

          {tab === "signup" || authConfig.registrationEnabled ? (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {tab === "signup" ? t("auth.alreadyHaveAccount") : t("auth.dontHaveAccount")}{" "}
              <button
                type="button"
                onClick={() => setTab(tab === "signup" ? "signin" : "signup")}
                className="font-medium text-foreground hover:text-gradient"
              >
                {tab === "signup" ? t("auth.submitSignIn") : t("auth.signUp")}
              </button>
            </p>
          ) : (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {registrationDisabledMessage}
            </p>
          )}
        </>
    </>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.638-.057-1.252-.164-1.84H9v3.48h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.614Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.181l-2.908-2.258c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.583-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.709A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.709V4.959H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.041l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.322 0 2.508.454 3.44 1.346l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.959l3.007 2.332C4.672 5.163 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.73.5.75 5.48.75 11.75c0 4.97 3.22 9.18 7.69 10.67.56.1.77-.24.77-.54v-2.1c-3.13.68-3.79-1.34-3.79-1.34-.51-1.31-1.25-1.66-1.25-1.66-1.03-.7.08-.69.08-.69 1.13.08 1.73 1.17 1.73 1.17 1.01 1.72 2.64 1.22 3.28.93.1-.73.4-1.22.72-1.5-2.5-.28-5.13-1.25-5.13-5.56 0-1.23.44-2.23 1.16-3.02-.12-.28-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.15.9-.25 1.86-.38 2.82-.38.95 0 1.92.13 2.82.38 2.15-1.45 3.09-1.15 3.09-1.15.62 1.55.23 2.7.12 2.98.72.79 1.16 1.79 1.16 3.02 0 4.32-2.63 5.27-5.14 5.55.41.35.77 1.03.77 2.08v3.11c0 .3.2.65.78.54a11.26 11.26 0 0 0 7.67-10.67C23.25 5.48 18.27.5 12 .5Z" />
    </svg>
  );
}
