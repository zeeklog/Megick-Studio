import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AdminTable, useAdminClientPagination, type Column } from "@/components/admin/AdminTable";
import { apiDelete, apiGet, apiPost } from "@/lib/api-client";
import { useAdminI18n } from "@/lib/admin-i18n";
import { FEATURE_VIDEO_GENERATION_ENABLED_KEY } from "@/lib/feature-flags";

export const Route = createFileRoute("/admin/site-settings")({
  component: AdminSiteSettings,
});

interface SettingRow {
  key: string;
  value: unknown;
  scope: string | null;
}

const AUTH_PASSWORD_LOGIN_KEY = "auth.passwordLoginEnabled";
const AUTH_REGISTRATION_KEY = "auth.registrationEnabled";
const AUTH_DEFAULT_REGISTRATION_CREDITS_KEY = "auth.defaultRegistrationCredits";
const KEEP_EXISTING_SECRET = "__KEEP_EXISTING__";

type SmtpConfig = {
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
};

type SmtpSummary = {
  id: string;
  isActive: boolean;
  hasConfig: boolean;
  missingKeys: string[];
  configuredKeys: string[];
  config: Partial<SmtpConfig>;
};

type SmtpDraft = Omit<SmtpConfig, "port"> & {
  port: string;
  isActive: boolean;
};

const emptySmtpDraft = (): SmtpDraft => ({
  host: "smtp.gmail.com",
  port: "587",
  secure: false,
  username: "",
  password: "",
  fromEmail: "",
  fromName: "Megick",
  replyTo: "",
  requireTls: true,
  rejectUnauthorized: true,
  isActive: false,
});

function smtpDraftFromSummary(summary?: SmtpSummary): SmtpDraft {
  const config = summary?.config ?? {};
  return {
    host: typeof config.host === "string" && config.host ? config.host : "smtp.gmail.com",
    port: String(Number(config.port) || 587),
    secure: Boolean(config.secure),
    username: typeof config.username === "string" ? config.username : "",
    password: typeof config.password === "string" ? config.password : "",
    fromEmail: typeof config.fromEmail === "string" ? config.fromEmail : "",
    fromName: typeof config.fromName === "string" && config.fromName ? config.fromName : "Megick",
    replyTo: typeof config.replyTo === "string" ? config.replyTo : "",
    requireTls: config.requireTls === undefined ? true : Boolean(config.requireTls),
    rejectUnauthorized:
      config.rejectUnauthorized === undefined ? true : Boolean(config.rejectUnauthorized),
    isActive: Boolean(summary?.isActive),
  };
}

function readDefaultRegistrationCredits(value: unknown) {
  const candidate =
    typeof value === "number" || typeof value === "string"
      ? value
      : value && typeof value === "object" && "credits" in value
        ? (value as { credits?: unknown }).credits
        : value && typeof value === "object" && "defaultCredits" in value
          ? (value as { defaultCredits?: unknown }).defaultCredits
          : undefined;
  const parsed = Number(candidate);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 80;
}

function readBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  if (value && typeof value === "object" && "enabled" in value) {
    return (value as { enabled?: unknown }).enabled === true;
  }
  return fallback;
}

function AdminSiteSettings() {
  const { t } = useAdminI18n();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({ key: "", scope: "", value: "" });
  const [defaultRegistrationCreditsDraft, setDefaultRegistrationCreditsDraft] = useState("80");
  const [smtpDraft, setSmtpDraft] = useState<SmtpDraft>(() => emptySmtpDraft());
  const [smtpTestEmail, setSmtpTestEmail] = useState("");

  const settingsQ = useQuery({
    queryKey: ["admin", "site-settings"],
    queryFn: () => apiGet<SettingRow[]>("/api/admin/site-settings"),
  });
  const smtpQ = useQuery({
    queryKey: ["admin", "smtp"],
    queryFn: () => apiGet<SmtpSummary>("/api/admin/smtp"),
  });

  const upsert = useMutation({
    mutationFn: () => {
      let parsed: unknown = draft.value;
      try {
        parsed = JSON.parse(draft.value);
      } catch {
        // keep as string
      }
      return apiPost("/api/admin/site-settings", {
        key: draft.key,
        value: parsed,
        scope: draft.scope || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "site-settings"] });
      setDraft({ key: "", scope: "", value: "" });
    },
  });

  const remove = useMutation({
    mutationFn: (key: string) => apiDelete(`/api/admin/site-settings/${encodeURIComponent(key)}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "site-settings"] }),
  });

  const saveAuthSetting = useMutation({
    mutationFn: (input: { key: string; value: boolean }) =>
      apiPost("/api/admin/site-settings", {
        key: input.key,
        value: input.value,
        scope: "auth",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "site-settings"] }),
  });

  const saveDefaultRegistrationCredits = useMutation({
    mutationFn: (credits: number) =>
      apiPost("/api/admin/site-settings", {
        key: AUTH_DEFAULT_REGISTRATION_CREDITS_KEY,
        value: credits,
        scope: "auth",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "site-settings"] }),
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Failed to save registration credits"),
  });

  const saveFeatureSetting = useMutation({
    mutationFn: (input: { key: string; value: boolean }) =>
      apiPost("/api/admin/site-settings", {
        key: input.key,
        value: input.value,
        scope: "features",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "site-settings"] });
      queryClient.invalidateQueries({ queryKey: ["site-settings", "features"] });
      queryClient.invalidateQueries({ queryKey: ["ai-models", "active"] });
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save feature setting"),
  });

  const saveSmtp = useMutation({
    mutationFn: (input: SmtpDraft) =>
      apiPost<SmtpSummary>("/api/admin/smtp", {
        host: input.host.trim(),
        port: Number(input.port),
        secure: input.secure,
        username: input.username.trim(),
        password: input.password,
        fromEmail: input.fromEmail.trim(),
        fromName: input.fromName.trim(),
        replyTo: input.replyTo.trim() || undefined,
        requireTls: input.requireTls,
        rejectUnauthorized: input.rejectUnauthorized,
        isActive: input.isActive,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "smtp"] });
      toast.success(t("page.siteSettings.smtpSaved"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save SMTP"),
  });

  const testSmtp = useMutation({
    mutationFn: (to: string) => apiPost("/api/admin/smtp/test", { to }),
    onSuccess: () => toast.success(t("page.siteSettings.smtpTestSent")),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to send test email"),
  });

  const authSetting = (key: string, fallback: boolean) => {
    const value = settingsQ.data?.find((s) => s.key === key)?.value;
    if (typeof value === "boolean") return value;
    if (value && typeof value === "object" && "enabled" in value) {
      return (value as { enabled?: unknown }).enabled !== false;
    }
    return fallback;
  };

  const passwordLoginEnabled = authSetting(AUTH_PASSWORD_LOGIN_KEY, true);
  const registrationEnabled = authSetting(AUTH_REGISTRATION_KEY, true);
  const registrationEmailVerificationEnabled = Boolean(smtpQ.data?.isActive && smtpQ.data.hasConfig);
  const defaultRegistrationCredits = readDefaultRegistrationCredits(
    settingsQ.data?.find((s) => s.key === AUTH_DEFAULT_REGISTRATION_CREDITS_KEY)?.value,
  );
  const videoGenerationEnabled = readBoolean(
    settingsQ.data?.find((s) => s.key === FEATURE_VIDEO_GENERATION_ENABLED_KEY)?.value,
    false,
  );
  const smtpCanSave =
    smtpDraft.host.trim().length > 0 &&
    Number.isInteger(Number(smtpDraft.port)) &&
    Number(smtpDraft.port) > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(smtpDraft.fromEmail.trim()) &&
    (!smtpDraft.isActive ||
      smtpDraft.password === KEEP_EXISTING_SECRET ||
      smtpDraft.password.trim().length > 0);

  useEffect(() => {
    setDefaultRegistrationCreditsDraft(String(defaultRegistrationCredits));
  }, [defaultRegistrationCredits]);

  useEffect(() => {
    setSmtpDraft(smtpDraftFromSummary(smtpQ.data));
  }, [smtpQ.data]);

  const rows = settingsQ.data ?? [];
  const table = useAdminClientPagination(rows);
  const columns: Column<SettingRow>[] = [
    { header: t("common.key"), cell: (s) => <code>{s.key}</code> },
    { header: t("common.scope"), cell: (s) => s.scope ?? "" },
    {
      header: t("common.value"),
      cell: (s) => <code className="text-xs">{JSON.stringify(s.value)}</code>,
    },
    {
      header: "",
      cell: (s) => (
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          onClick={() => remove.mutate(s.key)}
        >
          {t("common.delete")}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t("page.siteSettings.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("page.siteSettings.description")}</p>
      </header>

      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
        Open-source edition does not include online credit purchase flows.
        User credits are granted manually from the admin user detail page.
      </div>

      <div className="glass space-y-4 rounded-2xl p-5">
        <div>
          <h2 className="text-lg font-semibold">{t("page.siteSettings.authControls")}</h2>
          <p className="text-sm text-muted-foreground">{t("page.siteSettings.authDescription")}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="flex items-center justify-between rounded-xl border border-border bg-background/40 p-4">
            <div className="space-y-1">
              <Label htmlFor="password-login">{t("page.siteSettings.passwordLogin")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("page.siteSettings.passwordLoginDescription")}
              </p>
            </div>
            <Switch
              id="password-login"
              checked={passwordLoginEnabled}
              disabled={saveAuthSetting.isPending}
              onCheckedChange={(value) =>
                saveAuthSetting.mutate({ key: AUTH_PASSWORD_LOGIN_KEY, value })
              }
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border bg-background/40 p-4">
            <div className="space-y-1">
              <Label htmlFor="registration">{t("page.siteSettings.registration")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("page.siteSettings.registrationDescription")}
              </p>
            </div>
            <Switch
              id="registration"
              checked={registrationEnabled}
              disabled={saveAuthSetting.isPending}
              onCheckedChange={(value) =>
                saveAuthSetting.mutate({ key: AUTH_REGISTRATION_KEY, value })
              }
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border bg-background/40 p-4">
            <div className="space-y-1">
              <Label htmlFor="registration-email-verification">
                {t("page.siteSettings.registrationEmailVerification")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("page.siteSettings.registrationEmailVerificationDescription")}
              </p>
            </div>
            <Switch id="registration-email-verification" checked={registrationEmailVerificationEnabled} disabled />
          </div>
          <div className="rounded-xl border border-border bg-background/40 p-4">
            <Label htmlFor="default-registration-credits">
              {t("page.siteSettings.defaultRegistrationCredits")}
            </Label>
            <div className="mt-3 flex gap-2">
              <Input
                id="default-registration-credits"
                type="number"
                min={0}
                step={1}
                value={defaultRegistrationCreditsDraft}
                onChange={(event) => setDefaultRegistrationCreditsDraft(event.target.value)}
              />
              <Button
                type="button"
                disabled={
                  !Number.isInteger(Number(defaultRegistrationCreditsDraft)) ||
                  Number(defaultRegistrationCreditsDraft) < 0 ||
                  saveDefaultRegistrationCredits.isPending
                }
                onClick={() =>
                  saveDefaultRegistrationCredits.mutate(Number(defaultRegistrationCreditsDraft))
                }
              >
                {t("common.save")}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("page.siteSettings.defaultRegistrationCreditsDescription")}
            </p>
          </div>
        </div>
      </div>

      <div className="glass space-y-4 rounded-2xl p-5">
        <div>
          <h2 className="text-lg font-semibold">{t("page.siteSettings.smtpTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("page.siteSettings.smtpDescription")}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-background/40 p-4 lg:col-span-3">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="smtp-host">{t("page.siteSettings.smtpHost")}</Label>
                <Input
                  id="smtp-host"
                  value={smtpDraft.host}
                  onChange={(event) => setSmtpDraft({ ...smtpDraft, host: event.target.value })}
                  placeholder="smtp.gmail.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="smtp-port">{t("page.siteSettings.smtpPort")}</Label>
                <Input
                  id="smtp-port"
                  type="number"
                  min={1}
                  value={smtpDraft.port}
                  onChange={(event) => setSmtpDraft({ ...smtpDraft, port: event.target.value })}
                  placeholder="587"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="smtp-username">{t("page.siteSettings.smtpUsername")}</Label>
                <Input
                  id="smtp-username"
                  value={smtpDraft.username}
                  onChange={(event) =>
                    setSmtpDraft({ ...smtpDraft, username: event.target.value })
                  }
                  placeholder="you@gmail.com"
                  autoComplete="off"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="smtp-password">{t("page.siteSettings.smtpPassword")}</Label>
                <Input
                  id="smtp-password"
                  type="password"
                  value={smtpDraft.password}
                  onChange={(event) =>
                    setSmtpDraft({ ...smtpDraft, password: event.target.value })
                  }
                  placeholder={t("page.siteSettings.smtpPasswordPlaceholder")}
                  autoComplete="new-password"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="smtp-from-email">{t("page.siteSettings.smtpFromEmail")}</Label>
                <Input
                  id="smtp-from-email"
                  type="email"
                  value={smtpDraft.fromEmail}
                  onChange={(event) =>
                    setSmtpDraft({ ...smtpDraft, fromEmail: event.target.value })
                  }
                  placeholder="you@gmail.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="smtp-from-name">{t("page.siteSettings.smtpFromName")}</Label>
                <Input
                  id="smtp-from-name"
                  value={smtpDraft.fromName}
                  onChange={(event) =>
                    setSmtpDraft({ ...smtpDraft, fromName: event.target.value })
                  }
                  placeholder="Megick"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="smtp-reply-to">{t("page.siteSettings.smtpReplyTo")}</Label>
                <Input
                  id="smtp-reply-to"
                  type="email"
                  value={smtpDraft.replyTo}
                  onChange={(event) =>
                    setSmtpDraft({ ...smtpDraft, replyTo: event.target.value })
                  }
                  placeholder="support@example.com"
                />
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <label className="flex items-center gap-2 rounded-lg border border-border bg-background/40 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={smtpDraft.isActive}
                  onChange={(event) =>
                    setSmtpDraft({ ...smtpDraft, isActive: event.target.checked })
                  }
                />
                {t("page.siteSettings.smtpEnabled")}
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-border bg-background/40 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={smtpDraft.secure}
                  onChange={(event) =>
                    setSmtpDraft({ ...smtpDraft, secure: event.target.checked })
                  }
                />
                {t("page.siteSettings.smtpSecure")}
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-border bg-background/40 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={smtpDraft.requireTls}
                  onChange={(event) =>
                    setSmtpDraft({ ...smtpDraft, requireTls: event.target.checked })
                  }
                />
                {t("page.siteSettings.smtpRequireTls")}
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-border bg-background/40 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={smtpDraft.rejectUnauthorized}
                  onChange={(event) =>
                    setSmtpDraft({ ...smtpDraft, rejectUnauthorized: event.target.checked })
                  }
                />
                {t("page.siteSettings.smtpRejectUnauthorized")}
              </label>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                disabled={!smtpCanSave || saveSmtp.isPending}
                onClick={() => saveSmtp.mutate(smtpDraft)}
              >
                {t("page.siteSettings.smtpSave")}
              </Button>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-background/40 p-4">
            <h3 className="text-sm font-semibold">{t("page.siteSettings.smtpStatus")}</h3>
            <p className="mt-2 text-xs text-muted-foreground">
              {smtpQ.data?.hasConfig
                ? t("page.siteSettings.smtpReady")
                : t("page.siteSettings.smtpMissing", {
                    keys: smtpQ.data?.missingKeys.join(", ") || t("common.loading"),
                  })}
            </p>
            <div className="mt-4 grid gap-2">
              <Label htmlFor="smtp-test-email">{t("page.siteSettings.smtpTestEmail")}</Label>
              <Input
                id="smtp-test-email"
                type="email"
                value={smtpTestEmail}
                onChange={(event) => setSmtpTestEmail(event.target.value)}
                placeholder="admin@example.com"
              />
              <Button
                type="button"
                variant="outline"
                disabled={
                  !smtpQ.data?.isActive ||
                  !smtpQ.data.hasConfig ||
                  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(smtpTestEmail.trim()) ||
                  testSmtp.isPending
                }
                onClick={() => testSmtp.mutate(smtpTestEmail.trim())}
              >
                {t("page.siteSettings.smtpSendTest")}
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {t("page.siteSettings.smtpGmailHelp")}
            </p>
          </div>
        </div>
      </div>

      <div className="glass space-y-4 rounded-2xl p-5">
        <div>
          <h2 className="text-lg font-semibold">{t("page.siteSettings.featureControls")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("page.siteSettings.featureDescription")}
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex items-center justify-between rounded-xl border border-border bg-background/40 p-4">
            <div className="space-y-1">
              <Label htmlFor="video-generation-enabled">
                {t("page.siteSettings.videoGenerationEnabled")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("page.siteSettings.videoGenerationEnabledHelp")}
              </p>
            </div>
            <Switch
              id="video-generation-enabled"
              checked={videoGenerationEnabled}
              disabled={saveFeatureSetting.isPending}
              onCheckedChange={(value) =>
                saveFeatureSetting.mutate({
                  key: FEATURE_VIDEO_GENERATION_ENABLED_KEY,
                  value,
                })
              }
            />
          </div>
        </div>
      </div>

      <div className="glass space-y-3 rounded-2xl p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <Input
            placeholder={t("page.siteSettings.keyPlaceholder")}
            value={draft.key}
            onChange={(e) => setDraft({ ...draft, key: e.target.value })}
          />
          <Input
            placeholder={t("page.siteSettings.scopePlaceholder")}
            value={draft.scope}
            onChange={(e) => setDraft({ ...draft, scope: e.target.value })}
          />
          <div />
        </div>
        <Textarea
          placeholder={t("page.siteSettings.valuePlaceholder")}
          rows={3}
          value={draft.value}
          onChange={(e) => setDraft({ ...draft, value: e.target.value })}
        />
        <div className="flex justify-end">
          <Button onClick={() => upsert.mutate()}>{t("common.save")}</Button>
        </div>
      </div>

      <AdminTable
        rows={table.rows}
        columns={columns}
        loading={settingsQ.isLoading}
        rowKey={(s) => s.key}
        pagination={table.pagination}
      />
    </div>
  );
}
