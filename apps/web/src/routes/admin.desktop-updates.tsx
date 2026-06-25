import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  DesktopInstallerUploadResponse,
  DesktopPlatform,
  DesktopReleaseAdmin,
  PresignedDesktopUploadResponse,
} from "@megick/api-types";
import { AdminTable, type Column } from "@/components/admin/AdminTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { useAdminI18n } from "@/lib/admin-i18n";

export const Route = createFileRoute("/admin/desktop-updates")({
  component: AdminDesktopUpdates,
});

const platforms: DesktopPlatform[] = ["MAC", "WIN"];

type ReleaseDraft = {
  id: string | null;
  platform: DesktopPlatform;
  version: string;
  downloadUrl: string;
  r2ObjectKey: string;
  fileName: string;
  fileSizeBytes: string;
  sha256: string;
  sha512: string;
  releaseNotes: string;
  forceUpdate: boolean;
  isActive: boolean;
  isLatest: boolean;
};

type AdminTranslate = ReturnType<typeof useAdminI18n>["t"];

function emptyReleaseDraft(platform: DesktopPlatform): ReleaseDraft {
  return {
    id: null,
    platform,
    version: "",
    downloadUrl: "",
    r2ObjectKey: "",
    fileName: "",
    fileSizeBytes: "",
    sha256: "",
    sha512: "",
    releaseNotes: "",
    forceUpdate: true,
    isActive: true,
    isLatest: false,
  };
}

function AdminDesktopUpdates() {
  const { t, formatDateTime } = useAdminI18n();
  const queryClient = useQueryClient();
  const [platform, setPlatform] = useState<DesktopPlatform>("MAC");
  const [releaseDraft, setReleaseDraft] = useState<ReleaseDraft>(() => emptyReleaseDraft("MAC"));
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const releasesQ = useQuery({
    queryKey: ["admin", "desktop-updates", "releases", platform],
    queryFn: () =>
      apiGet<DesktopReleaseAdmin[]>("/api/admin/desktop-updates/releases", {
        query: { platform },
      }),
  });

  const uploadInstaller = useMutation({
    mutationFn: (file: File) => uploadInstallerFile(releaseDraft, file, setUploadProgress, t),
    onSuccess: (uploaded) => {
      setReleaseDraft((draft) => ({
        ...draft,
        downloadUrl: uploaded.publicUrl,
        r2ObjectKey: uploaded.objectKey,
        fileName: uploaded.fileName,
        fileSizeBytes: String(uploaded.fileSizeBytes),
      }));
      toast.success(t("page.desktopUpdates.installerUploaded"));
      setUploadProgress(null);
    },
    onError: (error) => {
      setUploadProgress(null);
      toast.error(error instanceof Error ? error.message : t("page.desktopUpdates.installerUploadFailed"));
    },
  });

  const saveRelease = useMutation({
    mutationFn: async () => {
      const draft = releaseDraft;

      const payload = releasePayload(draft);
      if (draft.id) {
        return apiPatch<DesktopReleaseAdmin>(`/api/admin/desktop-updates/releases/${draft.id}`, payload);
      }
      return apiPost<DesktopReleaseAdmin>("/api/admin/desktop-updates/releases", payload);
    },
    onSuccess: () => {
      toast.success(t("page.desktopUpdates.releaseSaved"));
      setReleaseDraft(emptyReleaseDraft(platform));
      setUploadProgress(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "desktop-updates", "releases", platform] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("page.desktopUpdates.releaseSaveFailed")),
  });

  const setLatest = useMutation({
    mutationFn: (id: string) => apiPost(`/api/admin/desktop-updates/releases/${id}/set-latest`),
    onSuccess: () => {
      toast.success(t("page.desktopUpdates.latestSet"));
      queryClient.invalidateQueries({ queryKey: ["admin", "desktop-updates", "releases", platform] });
    },
  });

  const removeRelease = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/desktop-updates/releases/${id}`),
    onSuccess: () => {
      toast.success(t("page.desktopUpdates.releaseDeleted"));
      queryClient.invalidateQueries({ queryKey: ["admin", "desktop-updates", "releases", platform] });
    },
  });

  const columns = useMemo<Column<DesktopReleaseAdmin>[]>(() => [
    { header: t("page.desktopUpdates.version"), cell: (row) => <span className="font-mono">{row.version}</span> },
    { header: t("common.status"), cell: (row) => (
      <div className="flex flex-col gap-1 text-xs">
        <span>{row.isLatest ? t("page.desktopUpdates.latest") : t("page.desktopUpdates.history")}</span>
        <span className={row.isActive ? "text-emerald-500" : "text-muted-foreground"}>{row.isActive ? t("common.active") : t("common.inactive")}</span>
        <span>{row.forceUpdate ? t("page.desktopUpdates.forceUpdate") : t("page.desktopUpdates.optionalUpdate")}</span>
      </div>
    ) },
    { header: t("page.desktopUpdates.downloadUrl"), className: "max-w-[360px]", cell: (row) => <div className="truncate text-xs text-muted-foreground">{row.downloadUrl}</div> },
    { header: t("page.desktopUpdates.file"), cell: (row) => <div className="text-xs text-muted-foreground"><div>{row.fileName || "-"}</div><div>{formatSize(row.fileSizeBytes)}</div></div> },
    { header: t("page.desktopUpdates.publishedAt"), cell: (row) => row.publishedAt ? formatDateTime(row.publishedAt) : "-" },
    { header: t("common.actions"), cell: (row) => (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setReleaseDraft(draftFromRelease(row))}>{t("common.edit")}</Button>
        <Button size="sm" variant="outline" disabled={row.isLatest || setLatest.isPending} onClick={() => setLatest.mutate(row.id)}>{t("page.desktopUpdates.setLatest")}</Button>
        <Button size="sm" variant="destructive" disabled={removeRelease.isPending} onClick={() => removeRelease.mutate(row.id)}>{t("common.delete")}</Button>
      </div>
    ) },
  ], [formatDateTime, removeRelease.isPending, setLatest.isPending, t]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("page.desktopUpdates.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("page.desktopUpdates.detail")}</p>
      </div>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("page.desktopUpdates.sectionTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("page.desktopUpdates.sectionDetail")}</p>
          </div>
          <Select value={platform} onValueChange={(value) => setPlatform(value as DesktopPlatform)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{platforms.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <AdminTable rows={releasesQ.data ?? []} columns={columns} rowKey={(row) => row.id} loading={releasesQ.isLoading} />

        <div className="mt-6 rounded-lg border bg-background/40 p-4">
          <h3 className="mb-4 font-medium">{releaseDraft.id ? t("page.desktopUpdates.editRelease") : t("page.desktopUpdates.newRelease")}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("page.desktopUpdates.platform")}><Select value={releaseDraft.platform} onValueChange={(value) => setReleaseDraft({ ...releaseDraft, platform: value as DesktopPlatform })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{platforms.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></Field>
            <Field label={t("page.desktopUpdates.version")}><Input placeholder="1.0.2" value={releaseDraft.version} onChange={(e) => setReleaseDraft({ ...releaseDraft, version: e.target.value })} /></Field>
            <Field label={t("page.desktopUpdates.installerUpload")}>
              <Input
                type="file"
                accept=".dmg,.zip,.exe,.msi"
                disabled={uploadInstaller.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.currentTarget.value = "";
                  if (file) uploadInstaller.mutate(file);
                }}
              />
              {uploadProgress !== null ? <div className="text-xs text-muted-foreground">{t("page.desktopUpdates.uploadProgress", { progress: uploadProgress })}</div> : null}
            </Field>
            {releaseDraft.downloadUrl ? <Field label={t("page.desktopUpdates.installerDownloadUrl")}><Input readOnly value={releaseDraft.downloadUrl} /></Field> : null}
            <div className="flex items-center gap-4 pt-7">
              <label className="flex items-center gap-2 text-sm"><Switch checked={releaseDraft.forceUpdate} onCheckedChange={(forceUpdate) => setReleaseDraft({ ...releaseDraft, forceUpdate })} />{t("page.desktopUpdates.forceUpdate")}</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={releaseDraft.isActive} onCheckedChange={(isActive) => setReleaseDraft({ ...releaseDraft, isActive })} />{t("common.enabled")}</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={releaseDraft.isLatest} onCheckedChange={(isLatest) => setReleaseDraft({ ...releaseDraft, isLatest })} />{t("page.desktopUpdates.setLatestAfterSave")}</label>
            </div>
            <Field label={t("page.desktopUpdates.releaseNotes")}><Textarea className="min-h-24" value={releaseDraft.releaseNotes} onChange={(e) => setReleaseDraft({ ...releaseDraft, releaseNotes: e.target.value })} /></Field>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => saveRelease.mutate()} disabled={saveRelease.isPending || uploadInstaller.isPending}>{t("page.desktopUpdates.saveRelease")}</Button>
            <Button variant="outline" onClick={() => { setReleaseDraft(emptyReleaseDraft(platform)); setUploadProgress(null); }}>{t("page.desktopUpdates.clear")}</Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

async function uploadInstallerFile(
  draft: ReleaseDraft,
  file: File,
  onProgress: (value: number) => void,
  t: AdminTranslate,
) {
  const version = draft.version.trim();
  if (!version) throw new Error(t("page.desktopUpdates.versionRequired"));

  const contentType = file.type || "application/octet-stream";
  const presigned = await apiPost<PresignedDesktopUploadResponse>(
    "/api/admin/desktop-updates/uploads/presign",
    {
      platform: draft.platform,
      version,
      fileName: file.name,
      contentType,
      fileSizeBytes: file.size,
    },
  );

  if (!presigned.publicUrl) {
    throw new Error(t("page.desktopUpdates.publicUrlMissing"));
  }

  onProgress(0);
  await putFileToR2(presigned.uploadUrl, file, contentType, onProgress, t);

  return {
    objectKey: presigned.objectKey,
    publicUrl: presigned.publicUrl,
    fileName: file.name,
    fileSizeBytes: file.size,
  } satisfies DesktopInstallerUploadResponse;
}

function putFileToR2(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress: (value: number) => void,
  t: AdminTranslate,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.withCredentials = false;
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      reject(new Error(uploadErrorMessage(xhr.status, null, xhr.responseText || "", t)));
    };
    xhr.onerror = () => reject(new Error(t("page.desktopUpdates.r2DirectFailed")));
    xhr.send(file);
  });
}

function uploadErrorMessage(
  status: number,
  payload: unknown,
  responseText: string,
  t: AdminTranslate,
) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (Array.isArray(message)) return message.join("；");
    if (message) return String(message);
  }

  const normalized = responseText.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (status === 413) return t("page.desktopUpdates.uploadTooLarge");
  if (status === 401 || status === 403) return t("page.desktopUpdates.uploadUnauthorized");
  if (normalized) {
    return t("page.desktopUpdates.uploadFailedWithStatusText", {
      status,
      detail: normalized.slice(0, 160),
    });
  }
  return t("page.desktopUpdates.uploadFailedWithStatus", { status });
}

function releasePayload(draft: ReleaseDraft) {
  return {
    platform: draft.platform,
    version: draft.version.trim(),
    ...(draft.downloadUrl.trim() ? { downloadUrl: draft.downloadUrl.trim() } : {}),
    r2ObjectKey: draft.r2ObjectKey.trim() || undefined,
    fileName: draft.fileName.trim() || undefined,
    fileSizeBytes: draft.fileSizeBytes ? Number(draft.fileSizeBytes) : undefined,
    releaseNotes: draft.releaseNotes,
    forceUpdate: draft.forceUpdate,
    isActive: draft.isActive,
    isLatest: draft.isLatest,
  };
}

function draftFromRelease(row: DesktopReleaseAdmin): ReleaseDraft {
  return {
    id: row.id,
    platform: row.platform,
    version: row.version,
    downloadUrl: row.downloadUrl,
    r2ObjectKey: row.r2ObjectKey ?? "",
    fileName: row.fileName ?? "",
    fileSizeBytes: row.fileSizeBytes ?? "",
    sha256: row.sha256 ?? "",
    sha512: row.sha512 ?? "",
    releaseNotes: row.releaseNotes ?? "",
    forceUpdate: row.forceUpdate,
    isActive: row.isActive,
    isLatest: row.isLatest,
  };
}

function formatSize(value?: string | null) {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return "-";
  if (size > 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`;
  return `${(size / 1024).toFixed(2)} KB`;
}
