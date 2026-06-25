import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Edit3, Eye, Image as ImageIcon, Plus, Trash2, Video } from "lucide-react";
import type {
  PromptTemplateCategoryPublic,
  PromptTemplatePublic,
  PromptTemplateStatus,
} from "@megick/api-types";
import {
  AdminTable,
  type AdminPaginatedResult,
  type Column,
} from "@/components/admin/AdminTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiDelete, apiGet, apiPost } from "@/lib/api-client";
import { useAdminI18n } from "@/lib/admin-i18n";
import { uploadDirectOssAsset } from "@/lib/oss-upload";
import { toast } from "sonner";

type TemplateKind = "TEXT2IMAGE" | "IMAGE2VIDEO";

function templateKindFromType(type: PromptTemplatePublic["type"]): TemplateKind {
  return type === "IMAGE2VIDEO" ? "IMAGE2VIDEO" : "TEXT2IMAGE";
}

type TemplateForm = {
  id?: string;
  type: TemplateKind;
  status: PromptTemplateStatus;
  title: string;
  description: string;
  textPrompt: string;
  materialPrompt: string;
  referenceAssetKeysText: string;
  exampleAssetKey: string;
  modelCode: string;
  paramsText: string;
  tagsText: string;
  categoryNames: string[];
  sortOrder: number;
  isFeatured: boolean;
  sourceChatSessionId?: string | null;
  sourceGenerationJobId?: string | null;
  sourceMessageId?: string | null;
};

const statusOptions: PromptTemplateStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];

const emptyForm = (type: TemplateKind): TemplateForm => ({
  type,
  status: "DRAFT",
  title: "",
  description: "",
  textPrompt: "",
  materialPrompt: "",
  referenceAssetKeysText: "",
  exampleAssetKey: "",
  modelCode: "",
  paramsText: "{}",
  tagsText: "",
  categoryNames: [],
  sortOrder: 0,
  isFeatured: false,
});

const formFromTemplate = (item: PromptTemplatePublic): TemplateForm => ({
  id: item.id,
  type: templateKindFromType(item.type),
  status: item.status,
  title: item.title,
  description: item.description ?? "",
  textPrompt: item.textPrompt,
  materialPrompt: item.materialPrompt ?? "",
  referenceAssetKeysText: item.referenceAssetKeys.join("\n"),
  exampleAssetKey: item.exampleAssetKey ?? "",
  modelCode: item.modelCode ?? "",
  paramsText: JSON.stringify(item.params ?? {}, null, 2),
  tagsText: item.tags.join(", "),
  categoryNames: item.categories?.length ? item.categories : item.category ? [item.category] : [],
  sortOrder: item.sortOrder,
  isFeatured: item.isFeatured,
  sourceChatSessionId: item.sourceChatSessionId,
  sourceGenerationJobId: item.sourceGenerationJobId,
  sourceMessageId: item.sourceMessageId,
});

const assetSrc = (key?: string | null) => {
  if (!key) return "";
  if (/^(https?:|data:)/i.test(key)) return key;
  return `/api/oss/sign?key=${encodeURIComponent(key)}`;
};

async function uploadTemplateAsset(file: File, prefix: string) {
  const uploaded = await uploadDirectOssAsset({
    file,
    name: file.name,
    prefix,
  });
  if (!uploaded) throw new Error("OSS 未配置，无法上传文件");
  return uploaded.key;
}

export function PromptTemplateAdminPage({
  type,
  title,
  description,
}: {
  type: TemplateKind;
  title: string;
  description: string;
}) {
  const { t } = useAdminI18n();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<TemplateForm | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const filters = useMemo(
    () => ({
      type,
      q: q.trim() || undefined,
      status: status || undefined,
      category: category || undefined,
    }),
    [category, q, status, type],
  );

  const categoriesQ = useQuery({
    queryKey: ["admin", "template-categories"],
    queryFn: () => apiGet<PromptTemplateCategoryPublic[]>("/api/admin/templates/categories"),
  });

  const templatesQ = useQuery({
    queryKey: ["admin", "templates", filters, page, pageSize],
    queryFn: () =>
      apiGet<AdminPaginatedResult<PromptTemplatePublic>>("/api/admin/templates", {
        query: { ...filters, page, pageSize },
      }),
    placeholderData: keepPreviousData,
  });

  const upsert = useMutation({
    mutationFn: (form: TemplateForm) => {
      let params: Record<string, unknown>;
      try {
        params = JSON.parse(form.paramsText || "{}") as Record<string, unknown>;
      } catch (err) {
        throw new Error(
          t("page.templates.invalidParams", {
            message: err instanceof Error ? err.message : "unknown",
          }),
        );
      }
      return apiPost("/api/admin/templates", {
        id: form.id,
        type: form.type,
        status: form.status,
        title: form.title,
        description: form.description || undefined,
        textPrompt: form.textPrompt,
        materialPrompt: form.materialPrompt || undefined,
        referenceAssetKeys: form.referenceAssetKeysText
          .split(/\n|,/)
          .map((item) => item.trim())
          .filter(Boolean),
        exampleAssetKey: form.exampleAssetKey || undefined,
        modelCode: form.modelCode || undefined,
        params,
        tags: form.tagsText
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        category: form.categoryNames[0] || undefined,
        categories: form.categoryNames,
        sortOrder: form.sortOrder,
        isFeatured: form.isFeatured,
        sourceChatSessionId: form.sourceChatSessionId || undefined,
        sourceGenerationJobId: form.sourceGenerationJobId || undefined,
        sourceMessageId: form.sourceMessageId || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "templates"] });
      setEditing(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "templates"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const rows = templatesQ.data?.items ?? [];

  const columns: Column<PromptTemplatePublic>[] = [
    {
      header: t("page.templates.template"),
      cell: (item) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-medium">
            {type === "TEXT2IMAGE" ? (
              <ImageIcon className="h-4 w-4 text-primary" />
            ) : (
              <Video className="h-4 w-4 text-primary" />
            )}
            <span className="line-clamp-1">{item.title}</span>
          </div>
          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.textPrompt}</div>
        </div>
      ),
      className: "max-w-md",
    },
    {
      header: t("page.templates.example"),
      cell: (item) =>
        item.exampleAssetKey ? (
          type === "IMAGE2VIDEO" ? (
            <video
              src={assetSrc(item.exampleAssetKey)}
              className="h-14 w-20 rounded-md object-cover"
            />
          ) : (
            <img
              src={assetSrc(item.exampleAssetKey)}
              alt={item.title}
              className="h-14 w-14 rounded-md object-cover"
            />
          )
        ) : (
          <span className="text-xs text-muted-foreground">{t("common.notSet")}</span>
        ),
    },
    {
      header: t("common.status"),
      cell: (item) => (
        <Badge variant={item.status === "PUBLISHED" ? "default" : "secondary"}>{item.status}</Badge>
      ),
    },
    { header: t("common.model"), cell: (item) => <code className="text-xs">{item.modelCode || t("common.auto")}</code> },
    {
      header: t("common.category"),
      cell: (item) => {
        const categories = item.categories?.length
          ? item.categories
          : item.category
            ? [item.category]
            : [];
        return categories.length ? (
          <div className="flex max-w-[220px] flex-wrap gap-1">
            {categories.map((category) => (
              <Badge key={category} variant="secondary">
                {category}
              </Badge>
            ))}
          </div>
        ) : (
          "—"
        );
      },
    },
    { header: t("common.sort"), cell: (item) => item.sortOrder },
    { header: t("page.templates.useCount"), cell: (item) => item.usageCount },
    {
      header: "",
      cell: (item) => (
        <div className="flex justify-end gap-1">
          {item.sourceChatSessionId ? (
            <Button asChild size="sm" variant="ghost" title={t("page.templates.viewSource")}>
              <Link to="/admin/user-chats" search={{ sessionId: item.sourceChatSessionId }}>
                <Eye className="h-4 w-4" />
              </Link>
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => setEditing(formFromTemplate(item))}>
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => window.confirm(t("page.templates.deleteConfirm")) && remove.mutate(item.id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button onClick={() => setEditing(emptyForm(type))}>
          <Plus className="mr-1.5 h-4 w-4" />
          {t("page.templates.new")}
        </Button>
      </header>

      <div className="grid gap-3 rounded-lg border border-border bg-background/40 p-4 md:grid-cols-[minmax(240px,1fr)_180px_200px_auto]">
        <Input
          placeholder={t("page.templates.search")}
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
          className="bg-secondary/40"
        />
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border border-border bg-background/40 px-3 text-sm"
        >
          <option value="">{t("page.templates.allStatuses")}</option>
          {statusOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border border-border bg-background/40 px-3 text-sm"
        >
          <option value="">{t("page.templates.allCategories")}</option>
          {(categoriesQ.data ?? []).map((item) => (
            <option key={item.id} value={item.name}>
              {item.isActive
                ? item.name
                : t("page.templates.disabledCategory", { name: item.name })}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          disabled={!q && !status && !category}
          onClick={() => {
            setQ("");
            setStatus("");
            setCategory("");
            setPage(1);
          }}
        >
          {t("common.reset")}
        </Button>
      </div>

      <AdminTable
        rows={rows}
        columns={columns}
        loading={templatesQ.isLoading}
        empty={t("page.templates.empty")}
        rowKey={(item) => item.id}
        pagination={{
          page: templatesQ.data?.page ?? page,
          pageSize: templatesQ.data?.pageSize ?? pageSize,
          pageCount: Math.max(templatesQ.data?.pageCount ?? 1, 1),
          total: templatesQ.data?.total ?? rows.length,
          itemCount: rows.length,
          hasNextPage: templatesQ.data?.hasNextPage ?? false,
          hasPreviousPage: templatesQ.data?.hasPreviousPage ?? page > 1,
          onPageChange: setPage,
          onPageSizeChange: (size) => {
            setPageSize(size);
            setPage(1);
          },
        }}
      />

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogTitle>
            {editing?.id ? t("page.templates.editTitle") : t("page.templates.newTitle")}
          </DialogTitle>
          {editing ? (
            <TemplateEditor
              value={editing}
              onChange={setEditing}
              onCancel={() => setEditing(null)}
              onSave={() => upsert.mutate(editing)}
              saving={upsert.isPending}
              categories={categoriesQ.data ?? []}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateEditor({
  value,
  onChange,
  onCancel,
  onSave,
  saving,
  categories,
}: {
  value: TemplateForm;
  onChange: (value: TemplateForm) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  categories: PromptTemplateCategoryPublic[];
}) {
  const { t } = useAdminI18n();
  const [uploading, setUploading] = useState(false);
  const patch = (next: Partial<TemplateForm>) => onChange({ ...value, ...next });
  const toggleCategory = (name: string, checked: boolean) => {
    const next = checked
      ? [...value.categoryNames, name]
      : value.categoryNames.filter((item) => item !== name);
    patch({ categoryNames: Array.from(new Set(next)) });
  };
  const uploadExample = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const key = await uploadTemplateAsset(file, "templates/examples");
      patch({ exampleAssetKey: key });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("page.templates.uploadFailed"));
    } finally {
      setUploading(false);
    }
  };
  const uploadReferences = async (files: FileList | null) => {
    const items = Array.from(files ?? []);
    if (!items.length) return;
    setUploading(true);
    try {
      const keys = await Promise.all(
        items.map((file) => uploadTemplateAsset(file, "templates/references")),
      );
      patch({
        referenceAssetKeysText: [value.referenceAssetKeysText, ...keys].filter(Boolean).join("\n"),
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("page.templates.uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-[1fr_180px_140px]">
        <Field label={t("common.title")}>
          <Input value={value.title} onChange={(event) => patch({ title: event.target.value })} />
        </Field>
        <Field label={t("common.status")}>
          <select
            value={value.status}
            onChange={(event) => patch({ status: event.target.value as PromptTemplateStatus })}
            className="h-9 rounded-md border border-border bg-background/40 px-3 text-sm"
          >
            {statusOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("common.sort")}>
          <Input
            type="number"
            value={value.sortOrder}
            onChange={(event) => patch({ sortOrder: Number(event.target.value) || 0 })}
          />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label={t("common.category")}>
          <div className="grid max-h-40 gap-2 overflow-y-auto rounded-md border border-border bg-background/40 p-2">
            {categories.length ? (
              categories.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={value.categoryNames.includes(item.name)}
                    onChange={(event) => toggleCategory(item.name, event.target.checked)}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {item.isActive
                      ? item.name
                      : t("page.templates.disabledCategory", { name: item.name })}
                  </span>
                </label>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">
                {t("page.templates.uncategorized")}
              </span>
            )}
          </div>
        </Field>
        <Field label={t("common.tags")}>
          <Input
            value={value.tagsText}
            onChange={(event) => patch({ tagsText: event.target.value })}
            placeholder={t("page.templates.tagsPlaceholder")}
          />
        </Field>
      </div>

      <Field label={t("page.templates.textPrompt")}>
        <Textarea
          rows={5}
          value={value.textPrompt}
          onChange={(event) => patch({ textPrompt: event.target.value })}
        />
      </Field>

      <Field label={t("page.templates.materialPrompt")}>
        <Textarea
          rows={3}
          value={value.materialPrompt}
          onChange={(event) => patch({ materialPrompt: event.target.value })}
          placeholder={t("page.templates.materialPromptPlaceholder")}
        />
      </Field>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label={t("page.templates.exampleAsset")}>
          <div className="grid gap-2">
            <Input
              value={value.exampleAssetKey}
              onChange={(event) => patch({ exampleAssetKey: event.target.value })}
            />
            <Input
              type="file"
              accept={value.type === "IMAGE2VIDEO" ? "video/*,image/*" : "image/*"}
              disabled={uploading}
              onChange={(event) => void uploadExample(event.target.files?.[0])}
            />
          </div>
        </Field>
        <Field label={t("page.templates.modelCode")}>
          <Input
            value={value.modelCode}
            onChange={(event) => patch({ modelCode: event.target.value })}
            placeholder={t("page.templates.modelPlaceholder")}
          />
        </Field>
      </div>

      <Field label={t("page.templates.referenceAssets")}>
        <div className="grid gap-2">
          <Textarea
            rows={3}
            value={value.referenceAssetKeysText}
            onChange={(event) => patch({ referenceAssetKeysText: event.target.value })}
            placeholder={t("page.templates.referencePlaceholder")}
          />
          <Input
            type="file"
            accept="image/*"
            multiple
            disabled={uploading}
            onChange={(event) => void uploadReferences(event.target.files)}
          />
        </div>
      </Field>

      <Field label={t("page.templates.paramsJson")}>
        <Textarea
          rows={6}
          value={value.paramsText}
          onChange={(event) => patch({ paramsText: event.target.value })}
          className="font-mono text-xs"
        />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.isFeatured}
          onChange={(event) => patch({ isFeatured: event.target.checked })}
        />
        {t("page.templates.featured")}
      </label>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button onClick={onSave} disabled={saving || uploading}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
