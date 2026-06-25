import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type {
  AIImageEditModeAdmin,
  AIImageEditModeFieldPublic,
  ModelProviderAdmin,
} from "@megick/api-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdminTable, useAdminClientPagination, type Column } from "@/components/admin/AdminTable";
import { apiDelete, apiGet, apiPost } from "@/lib/api-client";
import { useAdminI18n } from "@/lib/admin-i18n";

export const Route = createFileRoute("/admin/ai-image-edit-modes")({
  component: AdminAiImageEditModes,
});

type ModeDraft = AIImageEditModeAdmin;

type ModeTemplate = Pick<
  ModeDraft,
  "code" | "name" | "modelName" | "requiresMask" | "defaultParams" | "sortOrder" | "description"
> & { label: string };

function outpaintFields(): AIImageEditModeFieldPublic[] {
  return [
    {
      name: "prompt",
      label: "Outpaint prompt",
      type: "textarea",
      required: false,
      placeholder: "Describe the extended area, lighting, and style",
    },
    {
      name: "aspect_ratio",
      label: "Target ratio",
      type: "select",
      required: false,
      defaultValue: "1:1",
      options: ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9"],
    },
    {
      name: "direction",
      label: "Extension direction",
      type: "select",
      required: false,
      defaultValue: "all",
      options: ["all", "left", "right", "top", "bottom", "horizontal", "vertical"],
    },
    {
      name: "padding_percent",
      label: "Extension amount (%)",
      type: "number",
      required: false,
      defaultValue: 30,
      placeholder: "10-100",
    },
    {
      name: "seed",
      label: "Seed",
      type: "number",
      required: false,
      placeholder: "Leave blank for random",
    },
  ];
}

const modeTemplates: ModeTemplate[] = [
  {
    label: "Smart Erase · FLUX Erase",
    code: "smart-erase",
    name: "Smart Erase",
    modelName: "flux-erase",
    requiresMask: true,
    sortOrder: 10,
    description: "Brush over the area to remove and let the model naturally complete the background.",
    defaultParams: {
      apiStyle: "bfl-erase",
      requestModelName: "flux-erase",
      promptRequired: false,
      maskRequired: true,
      fields: [],
      output_format: "png",
      response_format: "url",
      dilate_pixels: 10,
      safety_tolerance: 4,
      maxInputMegapixels: 4,
      maxInputSide: 2048,
      normalizeMask: true,
      pollAttempts: 180,
      pollIntervalMs: 2000,
    },
  },
  {
    label: "Local Replace · FLUX.1 Fill",
    code: "local-replace",
    name: "Local Replace",
    modelName: "flux-pro-1.0-fill",
    requiresMask: true,
    sortOrder: 20,
    description: "Brush over the area to replace, then describe what should be redrawn.",
    defaultParams: {
      apiStyle: "bfl-fill",
      requestModelName: "flux-pro-1.0-fill",
      promptRequired: true,
      maskRequired: true,
      fields: [
        {
          name: "prompt",
          label: "Replacement prompt",
          type: "textarea",
          required: true,
          placeholder: "Describe what should replace the selected area",
        },
      ],
      output_format: "png",
      response_format: "url",
      steps: 15,
      guidance: 30,
      safety_tolerance: 4,
      maxInputMegapixels: 4,
      maxInputSide: 2048,
      normalizeMask: true,
      pollAttempts: 180,
      pollIntervalMs: 2000,
    },
  },
  {
    label: "Outpaint · Image Pro Preview",
    code: "outpaint",
    name: "Outpaint",
    modelName: "flux-2-pro-preview",
    requiresMask: false,
    sortOrder: 30,
    description: "Extend the image outward while preserving the original style, ratio, and direction.",
    defaultParams: {
      apiStyle: "flux2-edit",
      requestModelName: "flux-2-pro-preview",
      promptRequired: false,
      defaultPrompt: "Extend the image naturally while preserving the original style.",
      maskRequired: false,
      fields: outpaintFields(),
      output_format: "png",
      response_format: "url",
      pollAttempts: 180,
      pollIntervalMs: 2000,
    },
  },
  {
    label: "Text Edit · Image Pro Preview",
    code: "text-edit",
    name: "Text Edit",
    modelName: "flux-2-pro-preview",
    requiresMask: false,
    sortOrder: 40,
    description: "Edit the full image from a text instruction without a mask.",
    defaultParams: {
      apiStyle: "flux2-edit",
      requestModelName: "flux-2-pro-preview",
      promptRequired: true,
      maskRequired: false,
      fields: [
        {
          name: "prompt",
          label: "Edit prompt",
          type: "textarea",
          required: true,
          placeholder: "Describe how to edit this image",
        },
      ],
      output_format: "png",
      response_format: "url",
      pollAttempts: 180,
      pollIntervalMs: 2000,
    },
  },
];

const emptyMode: ModeDraft = {
  id: "",
  code: "smart-erase",
  name: "Smart Erase",
  providerId: null,
  modelName: "flux-pro-1.0-fill",
  requiresMask: true,
  defaultParams: modeTemplates[0]?.defaultParams ?? {
    apiStyle: "bfl-fill",
    pollAttempts: 180,
    pollIntervalMs: 2000,
  },
  costCredits: 1,
  isActive: true,
  sortOrder: 0,
  description: "",
};

function AdminAiImageEditModes() {
  const { t } = useAdminI18n();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ModeDraft | null>(null);

  const modesQ = useQuery({
    queryKey: ["admin", "ai-image-edit-modes"],
    queryFn: () => apiGet<AIImageEditModeAdmin[]>("/api/admin/ai-image-edit-modes"),
  });
  const providersQ = useQuery({
    queryKey: ["admin", "model-providers"],
    queryFn: () => apiGet<ModelProviderAdmin[]>("/api/admin/model-providers"),
  });

  const defaultProviderId =
    providersQ.data?.find((provider) => provider.code === "magickapi")?.id ?? null;

  const applyModeTemplate = (template: ModeTemplate) => {
    if (!editing) return;
    setEditing({
      ...editing,
      code: template.code,
      name: template.name,
      modelName: template.modelName,
      requiresMask: template.requiresMask,
      defaultParams: template.defaultParams,
      sortOrder: template.sortOrder,
      description: template.description,
    });
  };

  const upsert = useMutation({
    mutationFn: (input: ModeDraft) => apiPost("/api/admin/ai-image-edit-modes", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "ai-image-edit-modes"] });
      setEditing(null);
      toast.success(t("page.aiImageEditModes.saved"));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: (code: string) =>
      apiDelete(`/api/admin/ai-image-edit-modes/${encodeURIComponent(code)}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "ai-image-edit-modes"] }),
  });

  const table = useAdminClientPagination(modesQ.data ?? []);
  const columns: Column<AIImageEditModeAdmin>[] = [
    { header: "Code", cell: (mode) => <code>{mode.code}</code> },
    { header: t("common.name"), cell: (mode) => mode.name },
    { header: t("common.provider"), cell: (mode) => mode.provider?.name ?? t("common.notSet") },
    { header: t("common.model"), cell: (mode) => mode.modelName },
    {
      header: t("page.aiImageEditModes.requiresMask"),
      cell: (mode) =>
        mode.requiresMask ? (
          <Badge variant="secondary">{t("common.enabled")}</Badge>
        ) : (
          <span className="text-muted-foreground">{t("common.disabled")}</span>
        ),
    },
    { header: t("common.cost"), cell: (mode) => mode.costCredits },
    { header: t("common.active"), cell: (mode) => (mode.isActive ? "✓" : "—") },
    {
      header: "",
      cell: (mode) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(mode)}>
            {t("common.edit")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => window.confirm(`Delete ${mode.code}?`) && remove.mutate(mode.code)}
          >
            {t("common.delete")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("page.aiImageEditModes.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("page.aiImageEditModes.description")}</p>
        </div>
        <Button onClick={() => setEditing({ ...emptyMode, providerId: defaultProviderId })}>
          {t("common.create")}
        </Button>
      </header>

      <AdminTable
        rows={table.rows}
        columns={columns}
        loading={modesQ.isLoading}
        rowKey={(mode) => mode.id || mode.code}
        empty={t("common.empty")}
        pagination={table.pagination}
      />

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogTitle>
            {editing?.id
              ? t("page.aiImageEditModes.editTitle")
              : t("page.aiImageEditModes.newTitle")}
          </DialogTitle>
          {editing ? (
            <div className="grid gap-3">
              <Field label="模式模板">
                <select
                  className="h-9 w-full rounded-md border border-border bg-background/40 px-2 text-sm"
                  value={
                    modeTemplates.find((template) => template.code === editing.code)?.code ?? ""
                  }
                  onChange={(event) => {
                    const template = modeTemplates.find((item) => item.code === event.target.value);
                    if (template) applyModeTemplate(template);
                  }}
                >
                  <option value="">自定义模式</option>
                  {modeTemplates.map((template) => (
                    <option key={template.code} value={template.code}>
                      {template.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  选择模板会自动填充模型名、蒙版要求和文档参数字段，仍可在下方 JSON 中微调。
                </p>
              </Field>
              <Field label="Code">
                <Input
                  value={editing.code}
                  onChange={(event) => setEditing({ ...editing, code: event.target.value })}
                />
              </Field>
              <Field label={t("common.name")}>
                <Input
                  value={editing.name}
                  onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                />
              </Field>
              <Field label={t("common.provider")}>
                <select
                  className="h-9 w-full rounded-md border border-border bg-background/40 px-2 text-sm"
                  value={editing.providerId ?? ""}
                  onChange={(event) =>
                    setEditing({ ...editing, providerId: event.target.value || null })
                  }
                >
                  <option value="">{t("common.notSet")}</option>
                  {(providersQ.data ?? []).map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} ({provider.baseUrl})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("common.model")}>
                <Input
                  value={editing.modelName}
                  onChange={(event) => setEditing({ ...editing, modelName: event.target.value })}
                  placeholder="flux-pro-1.0-fill"
                />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label={t("common.cost")}>
                  <Input
                    type="number"
                    value={editing.costCredits}
                    onChange={(event) =>
                      setEditing({ ...editing, costCredits: Number(event.target.value) })
                    }
                  />
                </Field>
                <Field label={t("common.sort")}>
                  <Input
                    type="number"
                    value={editing.sortOrder}
                    onChange={(event) =>
                      setEditing({ ...editing, sortOrder: Number(event.target.value) })
                    }
                  />
                </Field>
                <Field label={t("common.active")}>
                  <label className="flex h-9 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editing.isActive}
                      onChange={(event) =>
                        setEditing({ ...editing, isActive: event.target.checked })
                      }
                    />
                    {t("common.enabled")}
                  </label>
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.requiresMask}
                  onChange={(event) =>
                    setEditing({ ...editing, requiresMask: event.target.checked })
                  }
                />
                {t("page.aiImageEditModes.requiresMask")}
              </label>
              <Field label={t("common.description")}>
                <Input
                  value={editing.description ?? ""}
                  onChange={(event) => setEditing({ ...editing, description: event.target.value })}
                />
              </Field>
              <Field label="支持模型参数">
                <div className="rounded-lg border border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
                  <div className="font-medium text-foreground">apiStyle</div>
                  <div className="mt-1 grid gap-1">
                    <div>
                      <code>bfl-fill</code>：FLUX.1 Fill，提交 <code>image</code>、<code>mask</code>
                      、<code>prompt</code>，适合局部替换。
                    </div>
                    <div>
                      <code>bfl-erase</code>：FLUX Erase，提交 <code>image</code>、<code>mask</code>
                      和 <code>dilate_pixels</code>，适合智能擦除。
                    </div>
                    <div>
                      <code>flux2-edit</code>：FLUX.2 编辑，提交 <code>input_image</code>、
                      <code>prompt</code> 和扩图/比例等附加字段，适合扩图和文本改图。
                    </div>
                  </div>
                </div>
              </Field>
              <Field label={t("page.aiImageEditModes.defaultParams")}>
                <Textarea
                  rows={5}
                  value={JSON.stringify(editing.defaultParams ?? {}, null, 2)}
                  onChange={(event) => {
                    try {
                      setEditing({
                        ...editing,
                        defaultParams: JSON.parse(event.target.value || "{}"),
                      });
                    } catch {
                      // Keep last valid JSON.
                    }
                  }}
                />
              </Field>
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={() => upsert.mutate(editing)}>{t("common.save")}</Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
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
