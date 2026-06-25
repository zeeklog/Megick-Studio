import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { AIModelPublic } from "@megick/api-types";
import { useAuth } from "@/hooks/useAuth";
import { apiGet } from "@/lib/api-client";
import { useVideoGenerationEnabled } from "@/lib/feature-flags";
import { useI18n } from "@/lib/i18n";
import {
  type StudioMode,
  type StudioSettings,
  defaultStudioSettings,
  studioPathForMode,
} from "./-dashboard-types";
import { type StudioSearch } from "./-studio-search";
import { isTruthySearchFlag } from "@/components/studio/panel/utils";
import type {
  StudioResultAction,
  StudioResultActionPayload,
} from "@/components/studio/panel/types";

export type { StudioResultAction, StudioResultActionPayload };

const ImageStudioPanel = lazy(async () => {
  const mod = await import("./-studio-image-panel");
  return { default: mod.ImageStudioPanel };
});

const VideoStudioPanel = lazy(async () => {
  const mod = await import("./-studio-video-panel");
  return { default: mod.VideoStudioPanel };
});

export function StudioPage({
  mode,
  search,
  embedded = false,
  resultActionLabel,
  onResultAction,
}: {
  mode: StudioMode;
  search: StudioSearch;
  embedded?: boolean;
  resultActionLabel?: string;
  onResultAction?: StudioResultAction;
}) {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { videoGenerationEnabled, isLoading: videoFlagLoading } = useVideoGenerationEnabled();

  const [studioPrompt, setStudioPrompt] = useState(search.prompt ?? "");

  const modelsQ = useQuery({
    queryKey: ["ai-models", "active"],
    queryFn: () => apiGet<AIModelPublic[]>("/api/ai-models"),
    enabled: !!user,
  });

  const [studioSettings, setStudioSettings] = useState(() =>
    defaultStudioSettings({
      mode,
      style: search.style ?? "none",
      ratio: search.ratio ?? (mode === "video" ? "16:9" : "1:1"),
      videoInputMode: mode === "video" && search.videoInputMode ? search.videoInputMode : null,
    }),
  );

  useEffect(() => {
    if (embedded) return;
    if (mode !== "video" || videoFlagLoading || videoGenerationEnabled) return;
    navigate({
      to: studioPathForMode("image"),
      search: {
        prompt: search.prompt,
        style: search.style,
        ratio: search.ratio,
        sourceImage: search.sourceImage,
        sourceImageName: search.sourceImageName,
        newSession: search.newSession,
        onboardingDemo: search.onboardingDemo,
        sessionId: search.sessionId,
      },
      replace: true,
    });
  }, [mode, navigate, search, videoFlagLoading, videoGenerationEnabled, embedded]);

  useEffect(() => {
    setStudioSettings((prev) => {
      const next = {
        ...prev,
        mode,
        ...(search.style ? { style: search.style } : {}),
        ...(search.ratio ? { ratio: search.ratio } : {}),
        ...(mode === "image" ? { videoInputMode: null } : {}),
        ...(mode === "video" && search.videoInputMode
          ? { videoInputMode: search.videoInputMode }
          : {}),
      };
      if (next.mode === "video") {
        next.style = "none";
        if (!search.ratio && prev.mode !== "video") next.ratio = "16:9";
      }
      return next.mode === prev.mode &&
        next.style === prev.style &&
        next.ratio === prev.ratio &&
        next.videoInputMode === prev.videoInputMode
        ? prev
        : next;
    });
  }, [mode, search.ratio, search.style, search.videoInputMode]);

  const models = modelsQ.data ?? [];
  const hasAdvancedAccess = Boolean(user?.hasAdvancedAccess);

  const sharedProps = {
    sessionId: search.sessionId,
    userId: user?.id,
    newSession: isTruthySearchFlag(search.newSession),
    onboardingDemo: isTruthySearchFlag(search.onboardingDemo),
    autoSubmit: isTruthySearchFlag(search.autoSubmit),
    focusJobId: search.jobId,
    templateId: search.templateId,
    handoffId: search.handoffId,
    sourceImage: search.sourceImage,
    sourceImageName: search.sourceImageName,
    searchVideoInputMode: search.videoInputMode,
    searchPrompt: search.prompt,
    models,
    modelsLoading: modelsQ.isLoading,
    videoGenerationEnabled,
    hasAdvancedAccess,
    embedded,
    resultActionLabel,
    onResultAction,
  };

  if (mode === "video") {
    if (videoFlagLoading) {
      return (
        <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
          {t("common.loading")}
        </div>
      );
    }
    if (!videoGenerationEnabled) {
      return (
        <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-border bg-card px-6 text-center text-sm text-muted-foreground">
          {t("studio.videoUnavailable")}
        </div>
      );
    }
  }

  if (mode === "video") {
    return (
      <Suspense fallback={null}>
        <VideoStudioPanel
          {...sharedProps}
          prompt={studioPrompt}
          setPrompt={setStudioPrompt}
          settings={studioSettings}
          setSettings={setStudioSettings}
        />
      </Suspense>
    );
  }

  return (
    <div className={embedded ? "flex h-full min-h-0" : "flex h-full min-h-0 flex-1"}>
      <Suspense fallback={null}>
        <ImageStudioPanel
          {...sharedProps}
          prompt={studioPrompt}
          setPrompt={setStudioPrompt}
          settings={studioSettings}
          setSettings={setStudioSettings}
        />
      </Suspense>
    </div>
  );
}
