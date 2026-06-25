import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiGet, apiPost } from "@/lib/api-client";
import { invalidateMe } from "@/hooks/useAuth";
import { toast } from "sonner";
import { noIndexHead } from "@/lib/seo";
import { useAdminI18n } from "@/lib/admin-i18n";

export const Route = createFileRoute("/admin/login")({
  head: () => noIndexHead({ title: "Admin login - Megick" }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const { t } = useAdminI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaId, setCaptchaId] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [captchaImage, setCaptchaImage] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const refreshCaptcha = async () => {
    setCaptchaLoading(true);
    try {
      const captcha = await apiGet<{
        captchaId: string;
        imageDataUrl: string;
        expiresInSeconds: number;
      }>("/api/admin/auth/captcha");
      setCaptchaId(captcha.captchaId);
      setCaptchaImage(captcha.imageDataUrl);
      setCaptchaCode("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("page.adminLogin.captchaLoadFailed"));
    } finally {
      setCaptchaLoading(false);
    }
  };

  useEffect(() => {
    void refreshCaptcha();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiPost("/api/admin/auth/login", {
        email,
        password,
        captchaId,
        captchaCode,
      });
      await invalidateMe(queryClient);
      navigate({ to: "/admin", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("page.adminLogin.loginFailed"));
      void refreshCaptcha();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="grid-bg absolute inset-0 opacity-30" />
      <div className="absolute -left-32 top-20 h-96 w-96 animate-float-slow rounded-full bg-[var(--neon-purple)] opacity-20 blur-3xl" />
      <div className="absolute -right-32 bottom-20 h-96 w-96 animate-float rounded-full bg-[var(--neon-pink)] opacity-20 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="glass-strong rounded-3xl p-8 shadow-card">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-5 w-5 text-[var(--neon-cyan)]" />
            Megick Admin
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">{t("page.adminLogin.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("page.adminLogin.description")}</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("page.adminLogin.email")}</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-secondary/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("page.adminLogin.password")}</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-secondary/50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="captcha">{t("page.adminLogin.verificationCode")}</Label>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input
                  id="captcha"
                  required
                  value={captchaCode}
                  onChange={(e) => setCaptchaCode(e.target.value.toUpperCase())}
                  className="bg-secondary/50"
                  autoComplete="off"
                  maxLength={8}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 gap-2 px-2"
                  onClick={() => void refreshCaptcha()}
                  disabled={captchaLoading}
                  aria-label={t("page.adminLogin.refreshVerificationCode")}
                >
                  {captchaImage ? (
                    <img
                      src={captchaImage}
                      alt={t("page.adminLogin.verificationCode")}
                      className="h-8 w-[92px] rounded object-cover"
                    />
                  ) : (
                    <span className="w-[92px] text-xs text-muted-foreground">{t("page.adminLogin.loadingCaptcha")}</span>
                  )}
                  <RefreshCw className={`h-4 w-4 ${captchaLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>
            <Button
              type="submit"
              disabled={submitting || !captchaId}
              size="lg"
              className="w-full bg-gradient-primary shadow-glow hover:opacity-90"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("page.adminLogin.submit")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
