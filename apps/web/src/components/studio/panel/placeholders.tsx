import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { StudioSettings } from "@/routes/-dashboard-types";
import { ratioParts } from "./utils";

export function GenerationPlaceholderGrid({
  settings,
  compact = false,
}: {
  settings: StudioSettings;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const count = settings.mode === "image" ? Math.min(Math.max(settings.count, 1), 4) : 1;
  return (
    <div className={cn("grid gap-2", count > 1 ? "grid-cols-2" : "grid-cols-1")}>
      {Array.from({ length: count }, (_, index) => (
        <AiRenderPlaceholder
          key={index}
          ratio={settings.ratio}
          label={t("studio.generating")}
          compact={compact}
        />
      ))}
    </div>
  );
}

export function GenerationPreviewPlaceholder({ settings }: { settings: StudioSettings }) {
  const { t } = useI18n();
  const ratio = ratioParts(settings.ratio);
  return (
    <div className="flex h-full w-full items-center justify-center bg-card p-6 text-card-foreground">
      <div
        className={cn("relative max-h-full max-w-full", ratio.value < 1 ? "h-full" : "w-full")}
        style={{ aspectRatio: ratio.css }}
      >
        <AiRenderPlaceholder ratio={settings.ratio} label={t("studio.generating")} />
      </div>
    </div>
  );
}

function AiRenderPlaceholder({
  ratio,
  label,
  compact = false,
}: {
  ratio: string;
  label: string;
  compact?: boolean;
}) {
  const ratioInfo = ratioParts(ratio);
  return (
    <div
      className={cn(
        "relative isolate flex h-full w-full min-w-0 overflow-hidden rounded-xl border border-border/70 bg-background/60 shadow-inner",
        compact ? "min-h-28" : "min-h-64",
      )}
      style={{ aspectRatio: ratioInfo.css }}
    >
      <AiRenderAnimationStyles />
      <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:28px_28px]" />
      <div className="absolute inset-0 bg-gradient-vibrant opacity-20 [animation:megick-ai-shimmer_2.4s_ease-in-out_infinite] [mask-image:linear-gradient(115deg,transparent_0%,black_38%,black_54%,transparent_76%)]" />
      <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-primary/25 to-transparent [animation:megick-ai-scan_2.2s_ease-in-out_infinite]" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex items-center gap-2 rounded-full border border-border/70 bg-card/80 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-[var(--neon-cyan)] [animation:megick-ai-spark_1.5s_ease-in-out_infinite]" />
          <span>{label}</span>
        </div>
      </div>
      <div className="absolute inset-x-4 bottom-4 h-1 overflow-hidden rounded-full bg-muted/70">
        <div className="h-full w-1/2 rounded-full bg-[linear-gradient(90deg,var(--neon-cyan),var(--neon-pink))] [animation:megick-ai-progress_1.9s_ease-in-out_infinite]" />
      </div>
    </div>
  );
}

function AiRenderAnimationStyles() {
  return (
    <style>
      {`
        @keyframes megick-ai-shimmer {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(120%); }
        }
        @keyframes megick-ai-scan {
          0%, 100% { transform: translateY(-100%); opacity: 0.18; }
          50% { transform: translateY(220%); opacity: 0.55; }
        }
        @keyframes megick-ai-progress {
          0% { transform: translateX(-110%); }
          50% { transform: translateX(60%); }
          100% { transform: translateX(210%); }
        }
        @keyframes megick-ai-spark {
          0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.65; }
          50% { transform: scale(1.18) rotate(12deg); opacity: 1; }
        }
      `}
    </style>
  );
}
