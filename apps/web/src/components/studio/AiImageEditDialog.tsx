import { useEffect, useMemo, useState } from "react";
import type { AIImageEditModeFieldPublic, AIImageEditModePublic } from "@megick/api-types";
import { ArrowRight, Brush, Image as ImageIcon, Loader2, Maximize2, Sparkles, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useI18n, type TranslationKey } from "@/lib/i18n";
import { localizedImageEditModeName } from "@/lib/studio-i18n";
import { ImageMaskEditor } from "@/components/studio/ImageMaskEditor";
import type { StudioEditTarget } from "@/components/studio/panel/types";

function localizedModeDescription(
  mode: AIImageEditModePublic,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (mode.code === "smart-erase") return t("studio.aiEdit.desc.smartErase");
  if (mode.code === "local-replace") return t("studio.aiEdit.desc.localReplace");
  if (mode.code === "outpaint") return t("studio.aiEdit.desc.outpaint");
  if (mode.code === "text-edit") return t("studio.aiEdit.desc.textEdit");
  return mode.description || t("studio.aiEdit.defaultDescription");
}

function localizedFieldLabel(field: AIImageEditModeFieldPublic, t: ReturnType<typeof useI18n>["t"]) {
  if (field.name === "aspect_ratio") return t("studio.aiEdit.field.aspectRatio");
  if (field.name === "direction") return t("studio.aiEdit.field.direction");
  if (field.name === "padding_percent") return t("studio.aiEdit.field.paddingPercent");
  if (field.name === "seed") return t("studio.aiEdit.field.seed");
  return field.label ?? field.name;
}

function localizedFieldPlaceholder(
  field: AIImageEditModeFieldPublic,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (field.name === "seed") return t("studio.aiEdit.field.seed.placeholder");
  return field.placeholder;
}

function localizedPromptField(
  mode: AIImageEditModePublic,
  field: AIImageEditModeFieldPublic | undefined,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (mode.code === "smart-erase") {
    return {
      label: t("studio.aiEdit.field.prompt.erase.label"),
      placeholder: t("studio.aiEdit.field.prompt.erase.placeholder"),
    };
  }
  if (mode.code === "local-replace") {
    return {
      label: t("studio.aiEdit.field.prompt.replace.label"),
      placeholder: t("studio.aiEdit.field.prompt.replace.placeholder"),
    };
  }
  if (mode.code === "outpaint") {
    return {
      label: t("studio.aiEdit.field.prompt.outpaint.label"),
      placeholder: t("studio.aiEdit.field.prompt.outpaint.placeholder"),
    };
  }
  if (mode.code === "text-edit") {
    return {
      label: t("studio.aiEdit.field.prompt.text.label"),
      placeholder: t("studio.aiEdit.field.prompt.text.placeholder"),
    };
  }
  return {
    label: field?.label ?? t("studio.aiEdit.prompt"),
    placeholder: field?.placeholder ?? t("studio.aiEdit.promptPlaceholder"),
  };
}

function fieldDefaultValue(field: AIImageEditModeFieldPublic) {
  const value = field.defaultValue;
  return value === undefined || value === null ? "" : String(value);
}

function modeActionLabelKey(code: string): TranslationKey {
  if (code === "smart-erase") return "studio.aiEdit.startErase";
  if (code === "local-replace") return "studio.aiEdit.startReplace";
  if (code === "outpaint") return "studio.aiEdit.startOutpaint";
  return "studio.aiEdit.startEdit";
}

function modeIcon(code: string) {
  if (code === "outpaint") return Maximize2;
  if (code === "smart-erase" || code === "local-replace") return Brush;
  return Wand2;
}

export function AiImageEditDialog({
  state,
  submitting,
  onOpenChange,
  onSubmit,
}: {
  state: { mode: AIImageEditModePublic; target: StudioEditTarget } | null;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    prompt: string;
    maskImage?: string;
    params: Record<string, unknown>;
  }) => Promise<void>;
}) {
  const { t } = useI18n();
  const mode = state?.mode ?? null;
  const fields = useMemo(() => mode?.defaultParams.fields ?? [], [mode]);
  const [prompt, setPrompt] = useState("");
  const [maskImage, setMaskImage] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!mode) return;
    setPrompt("");
    setMaskImage(null);
    setParams(
      Object.fromEntries(
        (mode.defaultParams.fields ?? [])
          .filter((field) => field.name !== "prompt")
          .map((field) => [field.name, fieldDefaultValue(field)]),
      ),
    );
  }, [mode]);

  if (!state || !mode) return null;

  const requiresMask = mode.requiresMask || mode.defaultParams.maskRequired === true;
  const promptField = fields.find((field) => field.name === "prompt");
  const extraFields = fields.filter((field) => field.name !== "prompt");
  const source = state.target.result.sourceSrc ?? state.target.result.src;
  const Icon = modeIcon(mode.code);
  const promptRequired = mode.defaultParams.promptRequired === true || promptField?.required === true;
  const modeLabel = localizedImageEditModeName(mode, t);
  const promptCopy = localizedPromptField(mode, promptField, t);

  const submit = async () => {
    const providerParams = Object.fromEntries(
      Object.entries(params).filter(([, value]) => value.trim().length > 0),
    );
    await onSubmit({
      prompt: prompt.trim(),
      maskImage: maskImage ?? undefined,
      params: providerParams,
    });
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] max-w-6xl overflow-hidden border-0 bg-transparent p-0 shadow-none sm:p-0">
        <DialogTitle className="sr-only">{modeLabel}</DialogTitle>
        <div className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card text-card-foreground shadow-[0_28px_100px_rgba(0,0,0,0.25)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,color-mix(in_oklab,var(--primary)_35%,transparent),transparent_30%),radial-gradient(circle_at_86%_10%,color-mix(in_oklab,var(--primary-glow)_26%,transparent),transparent_32%),linear-gradient(135deg,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_42%)]" />
          <button
            type="button"
            className="absolute right-4 top-4 z-20 rounded-full border border-border/70 bg-background/70 p-2 text-muted-foreground backdrop-blur transition hover:bg-background hover:text-foreground"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </button>

          <div className="relative z-10 grid max-h-[94dvh] overflow-y-auto lg:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.8fr)]">
            <section className="min-w-0 border-border/70 p-4 lg:border-r lg:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-glow">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
                      {modeLabel}
                    </div>
                  </div>
                </div>
                <div className="rounded-full border border-border/70 bg-background/65 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
                  {mode.costCredits > 0
                    ? t("studio.aiEdit.credits", { credits: mode.costCredits })
                    : t("studio.aiEdit.free")}
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-border/70 bg-muted/35 p-2 shadow-inner">
                {requiresMask ? (
                  <ImageMaskEditor src={source} onMaskChange={setMaskImage} variant="dark" />
                ) : (
                  <div className="relative overflow-hidden rounded-[1.15rem] bg-black">
                    <img
                      src={source}
                      alt={modeLabel}
                      className="max-h-[68vh] w-full object-contain lg:max-h-[72vh]"
                    />
                    <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 py-1 text-xs text-white/75 backdrop-blur">
                      <ImageIcon className="h-3.5 w-3.5" /> {t("studio.aiEdit.originalPreview")}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <aside className="flex min-h-[520px] flex-col bg-background/55 p-5 backdrop-blur-xl lg:rounded-r-[2rem] lg:p-6">
              <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
                <div className="text-sm font-medium text-foreground">{t("studio.aiEdit.instructions")}</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {localizedModeDescription(mode, t)}
                </p>
              </div>

              <div className="mt-5 grid flex-1 content-start gap-4">
                <label className="grid gap-2 text-sm">
                  <span className="flex items-center justify-between text-foreground">
                    <span>{promptCopy.label}</span>
                    {!promptRequired ? <span className="text-xs text-muted-foreground">{t("studio.aiEdit.optional")}</span> : null}
                  </span>
                  <Textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder={
                      promptCopy.placeholder
                    }
                    rows={6}
                    className="resize-none border-border/70 bg-background/70 text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/45"
                  />
                </label>

                {extraFields.length ? (
                  <div className="grid gap-3 rounded-2xl border border-border/70 bg-muted/30 p-3">
                    <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{t("studio.aiEdit.parameters")}</div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                      {extraFields.map((field) => (
                        <label
                          key={field.name}
                          className={cn(
                            "grid gap-1.5 text-sm",
                            field.type === "textarea" && "sm:col-span-2 lg:col-span-1 xl:col-span-2",
                          )}
                        >
                          <span className="text-foreground/80">{localizedFieldLabel(field, t)}</span>
                          {field.type === "select" && field.options?.length ? (
                            <select
                              className="h-10 rounded-xl border border-border/70 bg-background/80 px-3 text-sm text-foreground outline-none transition focus:border-primary/60"
                              value={params[field.name] ?? ""}
                              onChange={(event) =>
                                setParams((prev) => ({ ...prev, [field.name]: event.target.value }))
                              }
                            >
                              <option value="">{t("studio.aiEdit.defaultOption")}</option>
                              {field.options.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          ) : field.type === "textarea" ? (
                            <Textarea
                              value={params[field.name] ?? ""}
                              onChange={(event) =>
                                setParams((prev) => ({ ...prev, [field.name]: event.target.value }))
                              }
                              placeholder={localizedFieldPlaceholder(field, t)}
                              rows={3}
                              className="resize-none border-border/70 bg-background/70 text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/45"
                            />
                          ) : (
                            <Input
                              type={field.type === "number" ? "number" : "text"}
                              value={params[field.name] ?? ""}
                              onChange={(event) =>
                                setParams((prev) => ({ ...prev, [field.name]: event.target.value }))
                              }
                              placeholder={localizedFieldPlaceholder(field, t)}
                              className="h-10 border-border/70 bg-background/70 text-foreground placeholder:text-muted-foreground focus-visible:ring-primary/45"
                            />
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-5 grid gap-3 border-t border-border/70 pt-5">
                {requiresMask && !maskImage ? (
                  <div className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-foreground/80">
                    {t("studio.aiEdit.drawMaskFirst")}
                  </div>
                ) : null}
                <Button
                  type="button"
                  size="lg"
                  onClick={() => void submit()}
                  disabled={submitting || (promptRequired && !prompt.trim()) || (requiresMask && !maskImage)}
                  className="h-12 rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow transition hover:opacity-90"
                >
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {submitting ? t("studio.aiEdit.submitting") : t(modeActionLabelKey(mode.code))}
                  {!submitting ? <ArrowRight className="ml-2 h-4 w-4" /> : null}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  className="text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {t("common.cancel")}
                </Button>
              </div>
            </aside>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
