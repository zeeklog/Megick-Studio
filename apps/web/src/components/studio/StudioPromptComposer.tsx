import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles, Image as ImageIcon, Video, Wand2, ArrowRight, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { STYLE_PRESETS, RATIO_PRESETS } from "@/components/studio/presets";
import { useVideoGenerationEnabled } from "@/lib/feature-flags";
import { styleLabelKey, useI18n, type TranslationKey } from "@/lib/i18n";

const inspirationSampleKeys: TranslationKey[] = [
  "studio.inspiration.cat",
  "studio.inspiration.cyberpunk",
  "studio.inspiration.ink",
  "studio.inspiration.underwater",
  "studio.inspiration.ghibli",
];

export function StudioPromptComposer() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"image" | "video">("image");
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<string>(STYLE_PRESETS[0].id);
  const [ratio, setRatio] = useState<string>(RATIO_PRESETS[0].id);
  const { videoGenerationEnabled } = useVideoGenerationEnabled();
  const effectiveMode = videoGenerationEnabled ? mode : "image";

  useEffect(() => {
    if (!videoGenerationEnabled && mode === "video") setMode("image");
  }, [mode, videoGenerationEnabled]);

  const handleStart = () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      toast.error(t("studio.composer.empty"), {
        description: t("studio.composer.emptyDesc"),
      });
      return;
    }
    navigate({
      to: "/generate",
      search: { prompt: trimmed, mode: effectiveMode, style, ratio },
    });
  };

  const inspire = () => {
    const key = inspirationSampleKeys[Math.floor(Math.random() * inspirationSampleKeys.length)];
    const next = t(key);
    setPrompt(next);
  };

  return (
    <div className="relative mx-auto w-full max-w-lg">
      <div className="absolute inset-0 -z-10 animate-pulse-glow rounded-3xl bg-gradient-vibrant opacity-25 blur-3xl" />
      <div className="absolute -right-24 -top-10 h-44 w-44 animate-float rounded-full bg-[var(--neon-pink)] opacity-30 blur-3xl" />
      <div className="absolute -left-20 bottom-0 h-44 w-44 animate-float-slow rounded-full bg-[var(--neon-purple)] opacity-30 blur-3xl" />

      <div className="glass relative rounded-2xl border border-border/80 p-4 shadow-glow-pink sm:rounded-3xl sm:p-6">
        <div className="flex flex-col items-start justify-between gap-3 min-[460px]:flex-row min-[460px]:items-center">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--neon-cyan)]">
            <Sparkles className="h-3.5 w-3.5" />
            {t("studio.composer.badge")}
          </div>
          <Tabs value={effectiveMode} onValueChange={(v) => setMode(v as "image" | "video")}>
            <TabsList className="h-8 bg-secondary/50 p-0.5">
              <TabsTrigger value="image" className="h-7 gap-1.5 px-3 text-xs">
                <ImageIcon className="h-3.5 w-3.5" /> {t("studio.mode.image")}
              </TabsTrigger>
              {videoGenerationEnabled ? (
                <TabsTrigger value="video" className="h-7 gap-1.5 px-3 text-xs">
                  <Video className="h-3.5 w-3.5" /> {t("studio.mode.video")}
                </TabsTrigger>
              ) : null}
            </TabsList>
          </Tabs>
        </div>

        <div className="relative mt-4">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                handleStart();
              }
            }}
            placeholder={
              effectiveMode === "image"
                ? t("studio.composer.imagePlaceholder")
                : t("studio.composer.videoPlaceholder")
            }
            rows={5}
            className="resize-none border-border/70 bg-background/60 pr-9 text-sm leading-relaxed"
          />
          <button
            type="button"
            aria-label={t("studio.composer.inspiration")}
            onClick={inspire}
            className="absolute right-2 top-2 rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <Lightbulb className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-4">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("studio.composer.stylePresets")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {STYLE_PRESETS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStyle(s.id)}
                className={`rounded-full border px-2.5 py-1 text-xs transition ${style === s.id
                    ? "border-primary bg-primary/15 text-foreground shadow-glow"
                    : "border-border bg-background/40 text-muted-foreground hover:text-foreground"
                  }`}
              >
                {t(styleLabelKey(s.id))}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("studio.composer.ratio")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {RATIO_PRESETS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRatio(r.id)}
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition ${ratio === r.id
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-background/40 text-muted-foreground hover:text-foreground"
                  }`}
              >
                <span
                  className={`block rounded-sm border ${ratio === r.id ? "border-primary" : "border-muted-foreground/60"
                    }`}
                  style={{
                    width: r.iconW,
                    height: r.iconH,
                  }}
                />
                {r.id}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground">
            <Wand2 className="mr-1 inline-block h-3 w-3" />
            {t("studio.composer.shortcut")}
          </p>
          <Button
            type="button"
            onClick={handleStart}
            className="w-full bg-gradient-primary px-5 shadow-glow hover:opacity-90 sm:w-auto"
          >
            {t("studio.composer.start")} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
