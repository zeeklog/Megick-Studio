import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { useVideoGenerationEnabled } from "@/lib/feature-flags";
import { getInitialLocale, translate, useI18n } from "@/lib/i18n";
import { asSearchRecord, optionalEnum, optionalString } from "@/lib/search-params";
import { noIndexHead } from "@/lib/seo";

const GENERATE_MODES = ["image", "video"] as const;

function searchSchema(input: unknown): {
  prompt?: string;
  mode?: (typeof GENERATE_MODES)[number];
  style?: string;
  ratio?: string;
  sessionId?: string;
} {
  const search = asSearchRecord(input);
  return {
    prompt: optionalString(search.prompt),
    mode: optionalEnum(search.mode, GENERATE_MODES),
    style: optionalString(search.style),
    ratio: optionalString(search.ratio),
    sessionId: optionalString(search.sessionId),
  };
}

export const Route = createFileRoute("/generate")({
  head: () => {
    const locale = getInitialLocale();

    return noIndexHead({
      title: translate(locale, "generate.meta.title"),
      description: translate(locale, "generate.meta.description"),
    });
  },
  validateSearch: searchSchema,
  component: GenerateRedirect,
});

function GenerateRedirect() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { videoGenerationEnabled, isLoading } = useVideoGenerationEnabled();
  const wantsVideo = search.mode === "video";

  useEffect(() => {
    if (wantsVideo && isLoading) return;
    navigate({
      to: wantsVideo && videoGenerationEnabled ? "/dashboard/studio/video" : "/dashboard/studio/image",
      search: {
        prompt: search.prompt,
        style: search.style,
        ratio: search.ratio,
        sessionId: search.sessionId,
      },
      replace: true,
    });
  }, [
    isLoading,
    navigate,
    search.prompt,
    search.ratio,
    search.sessionId,
    search.style,
    videoGenerationEnabled,
    wantsVideo,
  ]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Sparkles className="h-5 w-5 animate-pulse text-primary" />
        {t("generate.opening")}
      </div>
    </div>
  );
}
