import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { Edit3, ImageIcon, Plus, Search, Trash2, Upload, VideoIcon } from "lucide-react";
import type { PromptTemplatePublic } from "@megick/api-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  AdminTable,
  useAdminClientPagination,
  type AdminPaginatedResult,
  type Column,
} from "@/components/admin/AdminTable";
import { apiDelete, apiGet, apiPost } from "@/lib/api-client";
import { useAdminI18n } from "@/lib/admin-i18n";
import { uploadDirectOssAsset } from "@/lib/oss-upload";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/showcase")({
  component: AdminShowcase,
});

interface ShowcaseRow {
  id: string;
  type: "TEXT2IMAGE" | "IMAGE2VIDEO";
  title: string;
  prompt: string;
  beforeAssetKey?: string | null;
  afterAssetKey: string;
  durationMs?: number | null;
  source?: string | null;
  sortOrder: number;
  isActive: boolean;
}

const empty = (): ShowcaseRow => ({
  id: "",
  type: "TEXT2IMAGE",
  title: "",
  prompt: "",
  afterAssetKey: "",
  sortOrder: 0,
  isActive: true,
});

const assetSrc = (keyOrUrl?: string | null) => {
  const raw = keyOrUrl?.trim();
  if (!raw) return "";
  if (/^(https?:|data:)/i.test(raw)) return raw;
  if (raw.startsWith("/api/oss/")) return raw;
  return `/api/oss/sign?key=${encodeURIComponent(raw)}`;
};

async function uploadShowcaseAsset(file: File, prefix = "showcase") {
  const uploaded = await uploadDirectOssAsset({
    file,
    name: file.name,
    prefix,
  });
  if (!uploaded) throw new Error("OSS_NOT_CONFIGURED");
  return uploaded.key;
}

function AdminShowcase() {
  const { t } = useAdminI18n();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ShowcaseRow | null>(null);
  const [templateSearch, setTemplateSearch] = useState("");
  const templateType = editing?.type ?? "TEXT2IMAGE";

  const itemsQ = useQuery({
    queryKey: ["admin", "showcase"],
    queryFn: () => apiGet<ShowcaseRow[]>("/api/admin/showcase"),
  });

  const templatesQ = useQuery({
    queryKey: ["admin", "showcase", "templates", templateType],
    enabled: !!editing,
    queryFn: () =>
      apiGet<AdminPaginatedResult<PromptTemplatePublic>>("/api/admin/templates", {
        query: { type: templateType, pageSize: 200 },
      }),
  });

  const upsert = useMutation({
    mutationFn: (input: ShowcaseRow) =>
      apiPost("/api/admin/showcase", {
        id: input.id || undefined,
        type: input.type,
        title: input.title.trim(),
        prompt: input.prompt.trim(),
        beforeAssetKey: input.beforeAssetKey?.trim() || null,
        afterAssetKey: input.afterAssetKey.trim(),
        durationMs: input.type === "IMAGE2VIDEO" ? (input.durationMs ?? null) : null,
        source: input.source?.trim() || null,
        sortOrder: Number(input.sortOrder) || 0,
        isActive: input.isActive,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "showcase"] });
      setEditing(null);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/showcase/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "showcase"] }),
  });

  const rows = itemsQ.data ?? [];
  const table = useAdminClientPagination(rows);
  const templateRows = templatesQ.data?.items ?? [];
  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return templateRows;
    return templateRows.filter((item) =>
      [item.title, item.textPrompt, item.category, item.modelCode]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [templateRows, templateSearch]);

  const applyTemplate = (template: PromptTemplatePublic) => {
    if (!editing) return;
    if (template.type !== "TEXT2IMAGE" && template.type !== "IMAGE2VIDEO") return;
    const resultAsset = template.exampleAssetKey?.trim();
    if (!resultAsset) {
      toast.error(t("page.showcase.templateMissingAsset"));
      return;
    }

    setEditing({
      ...editing,
      type: template.type,
      title: template.title,
      prompt: template.textPrompt,
      beforeAssetKey:
        template.type === "IMAGE2VIDEO"
          ? (template.referenceAssetKeys[0] ?? editing.beforeAssetKey)
          : editing.beforeAssetKey,
      afterAssetKey: resultAsset,
      durationMs: template.type === "IMAGE2VIDEO" ? editing.durationMs : null,
      source: `template:${template.id}`,
    });
  };

  const columns: Column<ShowcaseRow>[] = [
    {
      header: t("common.type"),
      cell: (item) =>
        item.type === "TEXT2IMAGE" ? t("page.showcase.type.image") : t("page.showcase.type.video"),
    },
    { header: t("common.title"), cell: (item) => item.title },
    {
      header: t("page.showcase.asset"),
      cell: (item) => (
        <code className="block max-w-xs truncate text-xs" title={item.afterAssetKey}>
          {item.afterAssetKey}
        </code>
      ),
    },
    { header: t("common.sort"), cell: (item) => item.sortOrder },
    {
      header: t("common.active"),
      cell: (item) => (item.isActive ? t("common.active") : t("common.inactive")),
    },
    {
      header: "",
      cell: (item) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setTemplateSearch("");
              setEditing(item);
            }}
          >
            <Edit3 className="h-4 w-4" />
            {t("common.edit")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() =>
              window.confirm(t("page.showcase.deleteConfirm")) && remove.mutate(item.id)
            }
          >
            <Trash2 className="h-4 w-4" />
            {t("common.delete")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("page.showcase.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("page.showcase.description")}</p>
        </div>
        <Button
          onClick={() => {
            setTemplateSearch("");
            setEditing(empty());
          }}
        >
          <Plus className="h-4 w-4" />
          {t("page.showcase.new")}
        </Button>
      </header>

      <AdminTable
        rows={table.rows}
        columns={columns}
        loading={itemsQ.isLoading}
        rowKey={(item) => item.id}
        pagination={table.pagination}
      />

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogTitle>
            {editing?.id ? t("page.showcase.editTitle") : t("page.showcase.newTitle")}
          </DialogTitle>
          {editing ? (
            <ShowcaseEditor
              value={editing}
              onChange={setEditing}
              onCancel={() => setEditing(null)}
              onSave={() => upsert.mutate(editing)}
              saving={upsert.isPending}
              templateSearch={templateSearch}
              onTemplateSearch={setTemplateSearch}
              templates={filteredTemplates}
              templatesLoading={templatesQ.isLoading}
              onApplyTemplate={applyTemplate}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ShowcaseEditor({
  value,
  onChange,
  onCancel,
  onSave,
  saving,
  templateSearch,
  onTemplateSearch,
  templates,
  templatesLoading,
  onApplyTemplate,
}: {
  value: ShowcaseRow;
  onChange: (value: ShowcaseRow) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  templateSearch: string;
  onTemplateSearch: (value: string) => void;
  templates: PromptTemplatePublic[];
  templatesLoading: boolean;
  onApplyTemplate: (template: PromptTemplatePublic) => void;
}) {
  const { t } = useAdminI18n();
  const [uploading, setUploading] = useState<"after" | "before" | null>(null);
  const patch = (next: Partial<ShowcaseRow>) => onChange({ ...value, ...next });
  const afterPreview = assetSrc(value.afterAssetKey);
  const beforePreview = assetSrc(value.beforeAssetKey);
  const afterIsVideo =
    value.type === "IMAGE2VIDEO" || /\.(mp4|mov|webm)(?:[?#].*)?$/i.test(value.afterAssetKey);

  const uploadAsset = async (file: File | undefined, target: "after" | "before") => {
    if (!file) return;
    setUploading(target);
    try {
      const key = await uploadShowcaseAsset(file);
      patch(target === "after" ? { afterAssetKey: key } : { beforeAssetKey: key });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown";
      toast.error(
        message === "OSS_NOT_CONFIGURED"
          ? t("page.showcase.ossMissing")
          : t("page.showcase.uploadFailed", { message }),
      );
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-[1fr_160px_150px]">
          <Field label={t("common.type")}>
            <select
              className="h-9 w-full rounded-md border border-border bg-background/40 px-2 text-sm"
              value={value.type}
              onChange={(event) =>
                patch({
                  type: event.target.value as ShowcaseRow["type"],
                  durationMs: event.target.value === "IMAGE2VIDEO" ? value.durationMs : null,
                })
              }
            >
              <option value="TEXT2IMAGE">{t("page.showcase.type.image")}</option>
              <option value="IMAGE2VIDEO">{t("page.showcase.type.video")}</option>
            </select>
          </Field>
          <Field label={t("common.sort")}>
            <Input
              type="number"
              value={value.sortOrder}
              onChange={(event) => patch({ sortOrder: Number(event.target.value) || 0 })}
            />
          </Field>
          <Field label={t("page.showcase.duration")}>
            <Input
              type="number"
              disabled={value.type !== "IMAGE2VIDEO"}
              value={value.durationMs ?? ""}
              onChange={(event) =>
                patch({ durationMs: event.target.value ? Number(event.target.value) : null })
              }
            />
          </Field>
        </div>

        <Field label={t("common.title")}>
          <Input value={value.title} onChange={(event) => patch({ title: event.target.value })} />
        </Field>

        <Field label={t("common.prompt")}>
          <Textarea
            rows={4}
            value={value.prompt}
            onChange={(event) => patch({ prompt: event.target.value })}
          />
        </Field>

        <Field label={t("page.showcase.resultAsset")}>
          <div className="grid gap-2">
            <Input
              value={value.afterAssetKey}
              onChange={(event) => patch({ afterAssetKey: event.target.value })}
              placeholder={t("page.showcase.resultPlaceholder")}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="file"
                accept={value.type === "IMAGE2VIDEO" ? "video/*,image/*" : "image/*"}
                disabled={uploading !== null}
                className="max-w-sm"
                onChange={(event) => {
                  const input = event.currentTarget;
                  void uploadAsset(input.files?.[0], "after").finally(() => {
                    input.value = "";
                  });
                }}
              />
              <span className="text-xs text-muted-foreground">
                {uploading === "after"
                  ? t("page.showcase.uploading")
                  : t("page.showcase.uploadResult")}
              </span>
            </div>
          </div>
        </Field>

        <Field label={t("page.showcase.beforeAsset")}>
          <div className="grid gap-2">
            <Input
              value={value.beforeAssetKey ?? ""}
              onChange={(event) => patch({ beforeAssetKey: event.target.value })}
              placeholder={t("page.showcase.beforePlaceholder")}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="file"
                accept="image/*"
                disabled={uploading !== null}
                className="max-w-sm"
                onChange={(event) => {
                  const input = event.currentTarget;
                  void uploadAsset(input.files?.[0], "before").finally(() => {
                    input.value = "";
                  });
                }}
              />
              <span className="text-xs text-muted-foreground">
                {uploading === "before"
                  ? t("page.showcase.uploading")
                  : t("page.showcase.uploadBefore")}
              </span>
            </div>
          </div>
        </Field>

        <Field label={t("common.source")}>
          <Input
            value={value.source ?? ""}
            onChange={(event) => patch({ source: event.target.value })}
            placeholder={t("page.showcase.sourcePlaceholder")}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.isActive}
            onChange={(event) => patch({ isActive: event.target.checked })}
          />
          {t("page.showcase.active")}
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={onSave}
            disabled={saving || uploading !== null || !value.afterAssetKey.trim()}
          >
            {t("common.save")}
          </Button>
        </div>
      </div>

      <div className="grid content-start gap-4">
        <div className="rounded-lg border border-border bg-background/40 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            {afterIsVideo ? <VideoIcon className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
            {t("page.showcase.mediaPreview")}
          </div>
          <div className="aspect-video overflow-hidden rounded-md bg-secondary/50">
            {afterPreview ? (
              afterIsVideo ? (
                <video
                  src={afterPreview}
                  poster={beforePreview || undefined}
                  controls
                  className="h-full w-full object-cover"
                />
              ) : (
                <img src={afterPreview} alt={value.title} className="h-full w-full object-cover" />
              )
            ) : (
              <div className="grid h-full place-items-center text-xs text-muted-foreground">
                {t("common.notSet")}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background/40 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="font-medium">{t("page.showcase.templatePicker")}</div>
            <span className="text-xs text-muted-foreground">
              {value.type === "TEXT2IMAGE"
                ? t("page.showcase.type.image")
                : t("page.showcase.type.video")}
            </span>
          </div>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={templateSearch}
              onChange={(event) => onTemplateSearch(event.target.value)}
              placeholder={t("page.showcase.templateSearch")}
              className="pl-8"
            />
          </div>
          <div className="grid max-h-[380px] gap-2 overflow-y-auto pr-1">
            {templatesLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {t("common.loading")}
              </div>
            ) : templates.length ? (
              templates.map((template) => (
                <TemplateOption
                  key={template.id}
                  template={template}
                  onUse={() => onApplyTemplate(template)}
                />
              ))
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {t("page.showcase.templateEmpty")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TemplateOption({
  template,
  onUse,
}: {
  template: PromptTemplatePublic;
  onUse: () => void;
}) {
  const { t } = useAdminI18n();
  const src = template.exampleUrl ?? assetSrc(template.exampleAssetKey);
  const isVideo = template.type === "IMAGE2VIDEO";

  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)_auto] gap-2 rounded-md border border-border/70 bg-secondary/25 p-2">
      <div className="h-14 overflow-hidden rounded bg-background/60">
        {src ? (
          isVideo ? (
            <video src={src} className="h-full w-full object-cover" muted playsInline />
          ) : (
            <img src={src} alt={template.title} className="h-full w-full object-cover" />
          )
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground">
            {isVideo ? <VideoIcon className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{template.title}</div>
        <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {template.textPrompt}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onUse} disabled={!template.exampleAssetKey}>
        <Upload className="h-4 w-4" />
        {t("page.showcase.useTemplate")}
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
