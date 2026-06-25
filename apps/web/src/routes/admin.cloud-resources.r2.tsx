import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { CloudR2ConfigAdmin } from "@megick/api-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiGet, apiPost } from "@/lib/api-client";
import { useAdminI18n } from "@/lib/admin-i18n";

export const Route = createFileRoute("/admin/cloud-resources/r2")({
  component: AdminCloudR2Config,
});

const KEEP_EXISTING_SECRET = "__KEEP_EXISTING__";
type R2Draft = Omit<CloudR2ConfigAdmin, "id" | "source" | "hasSecretAccessKey" | "missingKeys" | "publicDownloadAvailable">;

function emptyDraft(): R2Draft {
  return {
    isActive: true,
    accountId: "",
    endpoint: "",
    bucket: "",
    accessKeyId: "",
    secretAccessKey: "",
    publicBaseUrl: "",
    publicDevelopmentUrl: "",
    keyPrefix: "desktop-installers",
    presignExpiresSeconds: 3600,
  };
}

function AdminCloudR2Config() {
  const { t } = useAdminI18n();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<R2Draft>(() => emptyDraft());

  const configQ = useQuery({
    queryKey: ["admin", "cloud-resources", "r2-config"],
    queryFn: () => apiGet<CloudR2ConfigAdmin>("/api/admin/cloud-resources/r2-config"),
  });

  useEffect(() => {
    if (!configQ.data) return;
    setDraft({
      isActive: configQ.data.isActive,
      accountId: configQ.data.accountId,
      endpoint: configQ.data.endpoint,
      bucket: configQ.data.bucket,
      accessKeyId: configQ.data.accessKeyId,
      secretAccessKey: configQ.data.secretAccessKey,
      publicBaseUrl: configQ.data.publicBaseUrl,
      publicDevelopmentUrl: configQ.data.publicDevelopmentUrl,
      keyPrefix: configQ.data.keyPrefix,
      presignExpiresSeconds: configQ.data.presignExpiresSeconds,
    });
  }, [configQ.data]);

  const save = useMutation({
    mutationFn: () => apiPost<CloudR2ConfigAdmin>("/api/admin/cloud-resources/r2-config", draft),
    onSuccess: () => {
      toast.success(t("page.cloudR2.saved"));
      queryClient.invalidateQueries({ queryKey: ["admin", "cloud-resources", "r2-config"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("page.cloud.common.saveFailed")),
  });

  const test = useMutation({
    mutationFn: () => apiPost<{ ok: boolean }>("/api/admin/cloud-resources/r2-config/test"),
    onSuccess: () => toast.success(t("page.cloudR2.testSucceeded")),
    onError: (error) => toast.error(error instanceof Error ? error.message : t("page.cloudR2.testFailed")),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("page.cloudR2.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("page.cloudR2.detail")}</p>
      </div>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("page.cloudR2.sectionTitle")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("page.cloud.common.currentSource", { source: configQ.data?.source ?? "-" })}；{t("page.cloud.common.missing", {
                keys: configQ.data?.missingKeys.length
                  ? configQ.data.missingKeys.join(", ")
                  : t("page.cloud.common.none"),
              })}；{t("page.cloudR2.publicAccess", {
                status: configQ.data?.publicDownloadAvailable
                  ? t("page.cloudR2.publicConfigured")
                  : t("page.cloudR2.publicSigned"),
              })}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>{t("page.cloud.common.testConnection")}</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>{t("page.cloud.common.saveConfig")}</Button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Account ID"><Input value={draft.accountId} onChange={(e) => setDraft({ ...draft, accountId: e.target.value })} /></Field>
          <Field label="S3 API Endpoint"><Input value={draft.endpoint} onChange={(e) => setDraft({ ...draft, endpoint: e.target.value })} /></Field>
          <Field label="Bucket"><Input value={draft.bucket} onChange={(e) => setDraft({ ...draft, bucket: e.target.value })} /></Field>
          <Field label="Access Key ID"><Input value={draft.accessKeyId} onChange={(e) => setDraft({ ...draft, accessKeyId: e.target.value })} /></Field>
          <Field label={t("page.cloudR2.secretLabel")}><Input type="password" value={draft.secretAccessKey} placeholder={draft.secretAccessKey === KEEP_EXISTING_SECRET ? t("page.cloud.common.keepExistingSecret") : undefined} onChange={(e) => setDraft({ ...draft, secretAccessKey: e.target.value })} /></Field>
          <Field label="Public Base URL / Custom Domain"><Input value={draft.publicBaseUrl} onChange={(e) => setDraft({ ...draft, publicBaseUrl: e.target.value })} /></Field>
          <Field label="Public Development URL"><Input value={draft.publicDevelopmentUrl} onChange={(e) => setDraft({ ...draft, publicDevelopmentUrl: e.target.value })} /></Field>
          <Field label="Key Prefix"><Input value={draft.keyPrefix} onChange={(e) => setDraft({ ...draft, keyPrefix: e.target.value })} /></Field>
          <Field label="Presign Expires Seconds"><Input value={String(draft.presignExpiresSeconds)} onChange={(e) => setDraft({ ...draft, presignExpiresSeconds: Number(e.target.value) || 3600 })} /></Field>
          <label className="flex items-center gap-3 text-sm"><Switch checked={draft.isActive} onCheckedChange={(isActive) => setDraft({ ...draft, isActive })} />{t("page.cloud.common.enableDbConfig")}</label>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}
