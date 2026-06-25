import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { CloudOssConfigAdmin } from "@megick/api-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiGet, apiPost } from "@/lib/api-client";
import { useAdminI18n } from "@/lib/admin-i18n";

export const Route = createFileRoute("/admin/cloud-resources/oss")({
  component: AdminCloudOssConfig,
});

const KEEP_EXISTING_SECRET = "__KEEP_EXISTING__";
type OssDraft = Omit<CloudOssConfigAdmin, "id" | "source" | "hasAccessKeySecret" | "missingKeys">;

function emptyDraft(): OssDraft {
  return {
    isActive: true,
    region: "",
    endpoint: "",
    bucket: "",
    accessKeyId: "",
    accessKeySecret: "",
    domain: "",
    publicBaseUrl: "",
  };
}

function AdminCloudOssConfig() {
  const { t } = useAdminI18n();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<OssDraft>(() => emptyDraft());

  const configQ = useQuery({
    queryKey: ["admin", "cloud-resources", "oss-config"],
    queryFn: () => apiGet<CloudOssConfigAdmin>("/api/admin/cloud-resources/oss-config"),
  });

  useEffect(() => {
    if (!configQ.data) return;
    setDraft({
      isActive: configQ.data.isActive,
      region: configQ.data.region,
      endpoint: configQ.data.endpoint,
      bucket: configQ.data.bucket,
      accessKeyId: configQ.data.accessKeyId,
      accessKeySecret: configQ.data.accessKeySecret,
      domain: configQ.data.domain,
      publicBaseUrl: configQ.data.publicBaseUrl,
    });
  }, [configQ.data]);

  const save = useMutation({
    mutationFn: () => apiPost<CloudOssConfigAdmin>("/api/admin/cloud-resources/oss-config", draft),
    onSuccess: () => {
      toast.success(t("page.cloudOss.saved"));
      queryClient.invalidateQueries({ queryKey: ["admin", "cloud-resources", "oss-config"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("page.cloud.common.saveFailed")),
  });

  const test = useMutation({
    mutationFn: () => apiPost<{ ok: boolean }>("/api/admin/cloud-resources/oss-config/test"),
    onSuccess: () => toast.success(t("page.cloudOss.testSucceeded")),
    onError: (error) => toast.error(error instanceof Error ? error.message : t("page.cloudOss.testFailed")),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("page.cloudOss.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("page.cloudOss.detail")}</p>
      </div>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("page.cloudOss.sectionTitle")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("page.cloud.common.currentSource", { source: configQ.data?.source ?? "-" })}；{t("page.cloud.common.missing", {
                keys: configQ.data?.missingKeys.length
                  ? configQ.data.missingKeys.join(", ")
                  : t("page.cloud.common.none"),
              })}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>{t("page.cloud.common.testConnection")}</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>{t("page.cloud.common.saveConfig")}</Button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Region"><Input value={draft.region} onChange={(e) => setDraft({ ...draft, region: e.target.value })} /></Field>
          <Field label="Endpoint"><Input value={draft.endpoint} onChange={(e) => setDraft({ ...draft, endpoint: e.target.value })} /></Field>
          <Field label="Bucket"><Input value={draft.bucket} onChange={(e) => setDraft({ ...draft, bucket: e.target.value })} /></Field>
          <Field label="Access Key ID"><Input value={draft.accessKeyId} onChange={(e) => setDraft({ ...draft, accessKeyId: e.target.value })} /></Field>
          <Field label="Access Key Secret"><Input type="password" value={draft.accessKeySecret} placeholder={draft.accessKeySecret === KEEP_EXISTING_SECRET ? t("page.cloud.common.keepExistingSecret") : undefined} onChange={(e) => setDraft({ ...draft, accessKeySecret: e.target.value })} /></Field>
          <Field label="OSS Domain"><Input value={draft.domain} onChange={(e) => setDraft({ ...draft, domain: e.target.value })} /></Field>
          <Field label="Public Base URL"><Input value={draft.publicBaseUrl} onChange={(e) => setDraft({ ...draft, publicBaseUrl: e.target.value })} /></Field>
          <label className="flex items-center gap-3 text-sm"><Switch checked={draft.isActive} onCheckedChange={(isActive) => setDraft({ ...draft, isActive })} />{t("page.cloud.common.enableDbConfig")}</label>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}
