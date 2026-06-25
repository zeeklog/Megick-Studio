import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { ModelProviderAdmin } from "@megick/api-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AdminTable, useAdminClientPagination, type Column } from "@/components/admin/AdminTable";
import { apiGet, apiPost, apiDelete } from "@/lib/api-client";
import { useAdminI18n } from "@/lib/admin-i18n";
import { modelDisplayName } from "@/lib/model-display";

export const Route = createFileRoute("/admin/ai-models")({
  component: AdminAiModels,
});

interface AIModelRow {
  id: string;
  code: string;
  displayName: string;
  displayNameEn?: string | null;
  category: "TEXT" | "TEXT2IMAGE" | "IMAGE2VIDEO";
  textUsages?: string[];
  systemPrompt?: string;
  videoInputMode?: VideoInputMode | null;
  accessLevel: "FREE" | "PAID";
  providerId?: string | null;
  provider?: {
    id: string;
    code: string;
    name: string;
    baseUrl: string;
    isActive: boolean;
  } | null;
  baseUrl: string;
  modelName: string;
  costCredits: number;
  defaultParams: Record<string, unknown>;
  rateLimitPerMinute?: number;
  isActive: boolean;
  isDefault: boolean;
  supportsReferenceImages: boolean;
  requiresReferenceImages: boolean;
  sortOrder: number;
  description?: string;
  hasApiKey?: boolean;
  apiKey?: string;
}

type VideoInputMode = "T2V" | "I2V" | "R2V" | "EDIT";
type ModelKind = "TEXT" | "TEXT2IMAGE" | "VIDEO_T2V" | "VIDEO_I2V" | "VIDEO_R2V" | "VIDEO_EDIT";

const defaultTextUsages = ["生图提示词草稿", "生视频分镜制作"];
const textUsagesParamKey = "textUsages";
const systemPromptParamKey = "systemPrompt";

const modelKinds: ModelKind[] = [
  "TEXT",
  "TEXT2IMAGE",
  "VIDEO_T2V",
  "VIDEO_I2V",
  "VIDEO_R2V",
  "VIDEO_EDIT",
];

function kindToCategory(kind: ModelKind): AIModelRow["category"] {
  if (kind === "TEXT") return "TEXT";
  return kind === "TEXT2IMAGE" ? "TEXT2IMAGE" : "IMAGE2VIDEO";
}

function kindToVideoInputMode(kind: ModelKind): VideoInputMode | null {
  if (kind === "VIDEO_T2V") return "T2V";
  if (kind === "VIDEO_I2V") return "I2V";
  if (kind === "VIDEO_R2V") return "R2V";
  if (kind === "VIDEO_EDIT") return "EDIT";
  return null;
}

function rowKind(model: Pick<AIModelRow, "category" | "videoInputMode">): ModelKind {
  if (model.category === "TEXT") return "TEXT";
  if (model.category === "TEXT2IMAGE") return "TEXT2IMAGE";
  if (model.videoInputMode === "EDIT") return "VIDEO_EDIT";
  if (model.videoInputMode === "R2V") return "VIDEO_R2V";
  return model.videoInputMode === "T2V" ? "VIDEO_T2V" : "VIDEO_I2V";
}

function kindLabelKey(kind: ModelKind) {
  switch (kind) {
    case "TEXT":
      return "page.aiModels.kind.text";
    case "TEXT2IMAGE":
      return "page.aiModels.kind.textToImage";
    case "VIDEO_T2V":
      return "page.aiModels.kind.textToVideo";
    case "VIDEO_I2V":
      return "page.aiModels.kind.imageToVideo";
    case "VIDEO_R2V":
      return "page.aiModels.kind.referenceToVideo";
    case "VIDEO_EDIT":
      return "page.aiModels.kind.videoEdit";
  }
}

function paramsWithoutVideoInputMode(params: Record<string, unknown>) {
  const { videoInputMode: _videoInputMode, ...rest } = params;
  return rest;
}

function paramsWithoutTextUsages(params: Record<string, unknown>) {
  const { [textUsagesParamKey]: _textUsages, ...rest } = params;
  return rest;
}

function paramsWithoutTextSystemPrompt(params: Record<string, unknown>) {
  const { [systemPromptParamKey]: _systemPrompt, ...rest } = params;
  return rest;
}

function normalizeTextUsages(value: unknown): string[] {
  const source = Array.isArray(value) ? value : [];
  const usages = parseTextUsages(source);
  const unique = [...new Set(usages)];
  return unique.length > 0 ? unique : defaultTextUsages;
}

function parseTextUsages(value: unknown): string[] {
  const source = Array.isArray(value) ? value : [];
  return source
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function textUsagesFor(model: Pick<AIModelRow, "textUsages" | "defaultParams">) {
  return normalizeTextUsages(model.textUsages ?? model.defaultParams[textUsagesParamKey]);
}

function textUsagesText(model: Pick<AIModelRow, "textUsages" | "defaultParams">) {
  if (Array.isArray(model.textUsages)) return parseTextUsages(model.textUsages).join("\n");
  return textUsagesFor(model).join("\n");
}

function withTextUsages(model: AIModelRow, value: string): AIModelRow {
  const textUsages = parseTextUsages(value.split(/\r?\n|,/));
  return {
    ...model,
    textUsages,
    defaultParams: { ...model.defaultParams, [textUsagesParamKey]: textUsages },
  };
}

function systemPromptFor(model: Pick<AIModelRow, "systemPrompt" | "defaultParams">) {
  const value = model.systemPrompt ?? model.defaultParams[systemPromptParamKey];
  return typeof value === "string" ? value : "";
}

function withSystemPrompt(model: AIModelRow, value: string): AIModelRow {
  return {
    ...model,
    systemPrompt: value,
    defaultParams: { ...model.defaultParams, [systemPromptParamKey]: value },
  };
}

function defaultParamsForKind(kind: ModelKind): Record<string, unknown> {
  if (kind === "TEXT") return { [textUsagesParamKey]: defaultTextUsages };
  if (kind === "TEXT2IMAGE") return {};
  if (kind === "VIDEO_R2V") {
    return {
      apiStyle: "magick-video",
      videoInputMode: "R2V",
      duration: 5,
      resolution: "1080P",
      ratio: "16:9",
      watermark: false,
      prompt_extend: false,
      pollIntervalMs: 15000,
    };
  }
  if (kind === "VIDEO_EDIT") {
    return {
      apiStyle: "magick-video",
      videoInputMode: "EDIT",
      duration: 5,
      resolution: "720P",
      ratio: "16:9",
      watermark: false,
      prompt_extend: false,
      audio_setting: "keep",
      pollIntervalMs: 15000,
    };
  }
  return {
    apiStyle: "magick-video",
    videoInputMode: kindToVideoInputMode(kind),
    duration: 5,
    resolution: "720P",
    ratio: "16:9",
    watermark: false,
    prompt_extend: false,
  };
}

function applyKind(model: AIModelRow, kind: ModelKind): AIModelRow {
  const videoInputMode = kindToVideoInputMode(kind);
  const defaultParams = defaultParamsForKind(kind);
  const baseParams = paramsWithoutTextSystemPrompt(
    paramsWithoutTextUsages(paramsWithoutVideoInputMode(model.defaultParams)),
  );
  return {
    ...model,
    category: kindToCategory(kind),
    textUsages: kind === "TEXT" ? defaultTextUsages : [],
    systemPrompt: kind === "TEXT" ? model.systemPrompt : undefined,
    videoInputMode,
    isDefault: false,
    supportsReferenceImages: kind === "TEXT2IMAGE" ? model.supportsReferenceImages : false,
    requiresReferenceImages: kind === "TEXT2IMAGE" ? model.requiresReferenceImages : false,
    defaultParams:
      videoInputMode === null
        ? { ...baseParams, ...defaultParams }
        : { ...baseParams, ...defaultParams, videoInputMode },
  };
}

function kindOptionsFor(model: AIModelRow): ModelKind[] {
  if (model.category === "TEXT") return ["TEXT"];
  return model.category === "TEXT2IMAGE"
    ? ["TEXT2IMAGE"]
    : ["VIDEO_T2V", "VIDEO_I2V", "VIDEO_R2V", "VIDEO_EDIT"];
}

function costLabel(model: Pick<AIModelRow, "category" | "costCredits">) {
  return model.category === "IMAGE2VIDEO"
    ? `${model.costCredits}/s`
    : `${model.costCredits}/run`;
}

function withProvider(
  model: AIModelRow,
  providerId: string | null,
  providers: ModelProviderAdmin[] = [],
): AIModelRow {
  const provider = providerId
    ? providers.find((item) => item.id === providerId)
    : null;
  const nextDefaults =
    model.category === "IMAGE2VIDEO" && provider?.apiStyle === "VOLCENGINE"
      ? {
          ...model.defaultParams,
          apiStyle: "volcengine-video",
          duration:
            typeof model.defaultParams.duration === "number"
              ? Math.max(4, model.defaultParams.duration)
              : 4,
          ratio: model.defaultParams.ratio ?? model.defaultParams.aspect_ratio ?? "adaptive",
          resolution: "720p",
          generate_audio: false,
          watermark: false,
          pollAttempts: 360,
          pollIntervalMs: 5000,
          maxPollDurationMs: 30 * 60_000,
        }
      : model.defaultParams;
  return {
    ...model,
    providerId,
    defaultParams: nextDefaults,
    ...(providerId ? { baseUrl: "", apiKey: "" } : {}),
  };
}

const empty = (kind: ModelKind): AIModelRow => ({
  id: "",
  code: "",
  displayName: "",
  displayNameEn: "",
  category: kindToCategory(kind),
  textUsages: kind === "TEXT" ? defaultTextUsages : [],
  systemPrompt: kind === "TEXT" ? "" : undefined,
  videoInputMode: kindToVideoInputMode(kind),
  accessLevel: "FREE",
  providerId: null,
  baseUrl: "",
  modelName: "",
  costCredits: 1,
  defaultParams: defaultParamsForKind(kind),
  isActive: true,
  isDefault: false,
  supportsReferenceImages: false,
  requiresReferenceImages: false,
  sortOrder: 0,
});

function AdminAiModels() {
  const { locale, t } = useAdminI18n();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AIModelRow | null>(null);
  const [activeTab, setActiveTab] = useState<ModelKind>("TEXT");

  const modelsQ = useQuery({
    queryKey: ["admin", "ai-models"],
    queryFn: () => apiGet<AIModelRow[]>("/api/admin/ai-models"),
  });

  const providersQ = useQuery({
    queryKey: ["admin", "model-providers"],
    queryFn: () => apiGet<ModelProviderAdmin[]>("/api/admin/model-providers"),
  });

  const upsert = useMutation({
    mutationFn: (input: AIModelRow) => apiPost("/api/admin/ai-models", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "ai-models"] });
      setEditing(null);
      toast.success(t("page.aiModels.saved"));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("page.aiModels.saveFailed")),
  });

  const remove = useMutation({
    mutationFn: (code: string) => apiDelete(`/api/admin/ai-models/${encodeURIComponent(code)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "ai-models"] });
      toast.success(t("page.aiModels.deleted"));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t("page.aiModels.deleteFailed")),
  });

  const rows = (modelsQ.data ?? []).filter((model) => rowKind(model) === activeTab);
  const table = useAdminClientPagination(rows, { resetKeys: [activeTab] });

  const columns: Column<AIModelRow>[] = [
    { header: "Code", cell: (m) => <code>{m.code}</code> },
    { header: t("page.aiModels.display"), cell: (m) => modelDisplayName(m, locale) },
    {
      header: t("page.aiModels.access"),
      cell: (m) => (
        <Badge variant={m.accessLevel === "PAID" ? "default" : "secondary"}>
          {m.accessLevel === "PAID" ? t("page.aiModels.accessPaid") : t("page.aiModels.accessFree")}
        </Badge>
      ),
    },
    { header: t("common.model"), cell: (m) => m.modelName },
    { header: t("common.provider"), cell: (m) => m.provider?.name ?? t("page.aiModels.customProvider") },
    ...(activeTab === "TEXT2IMAGE"
      ? [
          {
            header: t("page.aiModels.referenceImages"),
            cell: (m: AIModelRow) => {
              if (!m.supportsReferenceImages) return "—";
              return m.requiresReferenceImages
                ? t("page.aiModels.referenceImagesRequired")
                : t("page.aiModels.referenceImagesOptional");
            },
          },
        ]
      : []),
    ...(activeTab === "TEXT"
      ? [
          {
            header: t("page.aiModels.textUsages"),
            cell: (m: AIModelRow) => textUsagesFor(m).join(", "),
          },
        ]
      : []),
    { header: t("common.cost"), cell: (m) => costLabel(m) },
    {
      header: t("page.aiModels.default"),
      cell: (m) =>
        m.isDefault ? (
          <Badge variant="secondary">{t("common.default")}</Badge>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => upsert.mutate({ ...m, isDefault: true, apiKey: undefined })}>
            {t("page.aiModels.setDefault")}
          </Button>
        ),
    },
    { header: t("common.token"), cell: (m) => (m.hasApiKey ? t("common.configured") : t("common.missing")) },
    { header: t("common.active"), cell: (m) => (m.isActive ? "✓" : "—") },
    {
      header: "",
      cell: (m) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing({ ...m, apiKey: undefined })}>
            {t("common.edit")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={remove.isPending}
            onClick={() => window.confirm(`Delete ${m.code}?`) && remove.mutate(m.code)}
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
          <h1 className="text-2xl font-bold tracking-tight">{t("page.aiModels.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("page.aiModels.description")}</p>
        </div>
        <Button onClick={() => setEditing(empty(activeTab))}>{t("common.create")}</Button>
      </header>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ModelKind)}>
        <TabsList>
          {modelKinds.map((kind) => (
            <TabsTrigger key={kind} value={kind}>
              {t(kindLabelKey(kind))}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <AdminTable
        rows={table.rows}
        columns={columns}
        loading={modelsQ.isLoading}
        rowKey={(m) => m.code}
        empty={t("common.empty")}
        pagination={table.pagination}
      />

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogTitle>{editing?.id ? "Edit model" : "New model"}</DialogTitle>
          {editing && (
            <div className="grid gap-3">
              <Field label="Code">
                <Input
                  value={editing.code}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                />
              </Field>
              <Field label={t("page.aiModels.displayZh")}>
                <Input
                  value={editing.displayName}
                  onChange={(e) => setEditing({ ...editing, displayName: e.target.value })}
                />
              </Field>
              <Field label={t("page.aiModels.displayEn")}>
                <Input
                  value={editing.displayNameEn ?? ""}
                  onChange={(e) => setEditing({ ...editing, displayNameEn: e.target.value })}
                />
              </Field>
              <Field label="Category">
                <select
                  className="h-9 w-full rounded-md border border-border bg-background/40 px-2 text-sm"
                  value={rowKind(editing)}
                  onChange={(e) => setEditing(applyKind(editing, e.target.value as ModelKind))}
                >
                  {kindOptionsFor(editing).map((kind) => (
                    <option key={kind} value={kind}>
                      {t(kindLabelKey(kind))}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("page.aiModels.access")}>
                <select
                  className="h-9 w-full rounded-md border border-border bg-background/40 px-2 text-sm"
                  value={editing.accessLevel}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      accessLevel: e.target.value as AIModelRow["accessLevel"],
                    })
                  }
                >
                  <option value="FREE">{t("page.aiModels.accessFree")}</option>
                  <option value="PAID">{t("page.aiModels.accessPaid")}</option>
                </select>
              </Field>
              <Field label={t("common.provider")}>
                <select
                  className="h-9 w-full rounded-md border border-border bg-background/40 px-2 text-sm"
                  value={editing.providerId ?? ""}
                  onChange={(e) =>
                    setEditing(
                      withProvider(
                        editing,
                        e.target.value || null,
                        providersQ.data ?? [],
                      ),
                    )
                  }
                >
                  <option value="">{t("page.aiModels.customProvider")}</option>
                  {(providersQ.data ?? []).map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} ({provider.baseUrl})
                    </option>
                  ))}
                </select>
              </Field>
              {!editing.providerId ? (
                <Field label="API endpoint / base URL">
                  <Input
                    value={editing.baseUrl}
                    onChange={(e) => setEditing({ ...editing, baseUrl: e.target.value })}
                    placeholder="https://seedanceapi.org/v2"
                  />
                </Field>
              ) : null}
              <Field label="Model name">
                <Input
                  value={editing.modelName}
                  onChange={(e) => setEditing({ ...editing, modelName: e.target.value })}
                />
              </Field>
              {editing.category === "TEXT" ? (
                <div className="grid gap-3">
                  <Field label={t("page.aiModels.textUsages")}>
                    <Textarea
                      rows={3}
                      value={textUsagesText(editing)}
                      onChange={(e) => setEditing(withTextUsages(editing, e.target.value))}
                      placeholder={defaultTextUsages.join("\n")}
                    />
                  </Field>
                  <Field label={t("page.aiModels.systemPrompt")}>
                    <Textarea
                      rows={5}
                      value={systemPromptFor(editing)}
                      onChange={(e) => setEditing(withSystemPrompt(editing, e.target.value))}
                      placeholder={t("page.aiModels.systemPromptPlaceholder")}
                    />
                  </Field>
                </div>
              ) : null}
              {editing.category === "TEXT2IMAGE" ? (
                <div className="grid gap-2 rounded-md border border-border/70 p-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editing.supportsReferenceImages}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          supportsReferenceImages: e.target.checked,
                          requiresReferenceImages: e.target.checked
                            ? editing.requiresReferenceImages
                            : false,
                        })
                      }
                    />{" "}
                    {t("page.aiModels.supportsReferenceImages")}
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editing.requiresReferenceImages}
                      disabled={!editing.supportsReferenceImages}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          supportsReferenceImages:
                            editing.supportsReferenceImages || e.target.checked,
                          requiresReferenceImages: e.target.checked,
                        })
                      }
                    />{" "}
                    {t("page.aiModels.requiresReferenceImages")}
                  </label>
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label={
                    editing.category === "IMAGE2VIDEO"
                      ? t("page.aiModels.costPerSecond")
                      : t("page.aiModels.costPerGeneration")
                  }
                >
                  <Input
                    type="number"
                    value={editing.costCredits}
                    onChange={(e) =>
                      setEditing({ ...editing, costCredits: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Sort">
                  <Input
                    type="number"
                    value={editing.sortOrder}
                    onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })}
                  />
                </Field>
              </div>
              {!editing.providerId ? (
                <Field label="API Token (leave blank to keep existing)">
                  <Input
                    type="password"
                    value={editing.apiKey ?? ""}
                    onChange={(e) => setEditing({ ...editing, apiKey: e.target.value })}
                    placeholder={editing.hasApiKey ? "Configured" : "sk-..."}
                  />
                </Field>
              ) : null}
              <Field label="Default params (JSON)">
                <Textarea
                  rows={4}
                  value={JSON.stringify(editing.defaultParams, null, 2)}
                  onChange={(e) => {
                    try {
                      const parsed = JSON.parse(e.target.value || "{}");
                      setEditing({ ...editing, defaultParams: parsed });
                    } catch {
                      // ignore parse errors live; will refuse on save
                    }
                  }}
                />
              </Field>
              <label className="mt-1 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.isActive}
                  onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
                />{" "}
                Active
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.isDefault}
                  onChange={(e) => setEditing({ ...editing, isDefault: e.target.checked })}
                />{" "}
                Use as default for this business
              </label>
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button onClick={() => upsert.mutate(editing)}>Save</Button>
              </div>
            </div>
          )}
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
