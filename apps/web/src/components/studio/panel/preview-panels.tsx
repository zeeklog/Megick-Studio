import { useEffect, useMemo, useRef, useState, useCallback, type ReactNode } from "react";
import type { GenerationJobPublic } from "@megick/api-types";
import {
  Copy,
  Download,
  Edit3,
  FileVideo,
  Image as ImageIcon,
  ImagePlus,
  Layers,
  Loader2,
  Maximize2,
  MessageSquare,
  Repeat,
  RefreshCw,
  RotateCcw,
  Scissors,
  Sparkles,
  Video,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ossThumbnailUrl } from "@/lib/oss-upload";
import type { StudioMode, StudioResult } from "@/routes/-dashboard-types";
import { studioResultsFromJob } from "@/routes/-dashboard-types";
import { formatDateTime, StatusBadge } from "@/routes/-dashboard-components";
import { Progress } from "@/components/ui/progress";
import { jobOutputContentUrl, mediaKindFromUrl, videoModeLabelKey } from "./utils";
import { studioGenerationErrorNotice } from "./generation-error-presenter";
import {
  PREVIEW_TOOL_ACCENT_BUTTON_CLASS,
  PREVIEW_TOOL_BUTTON_CLASS,
  PREVIEW_TOOLBAR_CLASS,
  PreviewToolbarToggle,
  usePreviewToolbarVisibility,
} from "./preview-toolbar";

export function ImagePreviewPanel({
  result,
  onZoom,
  onDownload,
  onDownloadPsd,
  onEdit,
  onUseAsReference,
  editMenu,
  onGenerateVideo,
  videoGenerationEnabled,
  resultActionLabel,
  onResultAction,
}: {
  result: StudioResult;
  onZoom: () => void;
  onDownload: () => Promise<void>;
  onDownloadPsd: () => Promise<void>;
  onEdit: () => void;
  onUseAsReference?: () => void;
  editMenu?: ReactNode;
  onGenerateVideo: (videoInputMode: "I2V" | "R2V") => void;
  videoGenerationEnabled: boolean;
  resultActionLabel?: string;
  onResultAction?: () => void;
}) {
  const { t } = useI18n();
  const [downloading, setDownloading] = useState<"media" | "psd" | null>(null);
  const [toolbarVisible, setToolbarVisible] = usePreviewToolbarVisibility();

  const runDownload = async (kind: "media" | "psd", action: () => Promise<void>) => {
    if (downloading) return;
    setDownloading(kind);
    try {
      await action();
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {toolbarVisible ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-black/18 via-black/6 to-transparent" />
          <div className="absolute right-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-col items-end gap-2">
            <div className={PREVIEW_TOOLBAR_CLASS} data-onboarding-target="image-result-actions">
              <PreviewToolbarToggle visible onToggle={() => setToolbarVisible(false)} />
              <Button
                size="sm"
                variant="ghost"
                onClick={onZoom}
                title={t("studio.fullscreen")}
                className={PREVIEW_TOOL_BUTTON_CLASS}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
              {videoGenerationEnabled ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className={PREVIEW_TOOL_ACCENT_BUTTON_CLASS}
                      title={t("studio.generateVideoTitle")}
                    >
                      <Video className="mr-1.5 h-3.5 w-3.5" /> {t("studio.generateVideo")}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onGenerateVideo("I2V")}>
                      <ImageIcon className="mr-2 h-3.5 w-3.5" />
                      {t(videoModeLabelKey("I2V"))}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onGenerateVideo("R2V")}>
                      <Layers className="mr-2 h-3.5 w-3.5" />
                      {t(videoModeLabelKey("R2V"))}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              {!onResultAction
                ? (editMenu ?? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onEdit}
                      className={PREVIEW_TOOL_BUTTON_CLASS}
                    >
                      <Edit3 className="mr-1.5 h-3.5 w-3.5" /> {t("common.edit")}
                    </Button>
                  ))
                : null}
              {!onResultAction && onUseAsReference ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onUseAsReference}
                  title={t("studio.asReferenceTitle")}
                  data-onboarding-target="image-use-as-reference"
                  className={PREVIEW_TOOL_BUTTON_CLASS}
                >
                  <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
                  {t("studio.asReference")}
                </Button>
              ) : null}
              {onResultAction ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onResultAction}
                  className={PREVIEW_TOOL_ACCENT_BUTTON_CLASS}
                  title={resultActionLabel ?? t("studio.editor.importAction")}
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  {resultActionLabel ?? t("studio.editor.importAction")}
                </Button>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    disabled={Boolean(downloading)}
                    className="border border-white/20 bg-white/[0.18] text-white shadow-sm backdrop-blur-xl hover:bg-white/[0.30] hover:text-white"
                  >
                    {downloading ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                    )}{" "}
                    {t("studio.download")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={Boolean(downloading)}
                    onClick={() => void runDownload("media", onDownload)}
                  >
                    <Download className="mr-2 h-3.5 w-3.5" />
                    {t("studio.downloadImage")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={Boolean(downloading)}
                    onClick={() => void runDownload("psd", onDownloadPsd)}
                  >
                    <Layers className="mr-2 h-3.5 w-3.5" />
                    {t("studio.downloadPsd")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </>
      ) : (
        <div className="absolute right-3 top-3 z-20">
          <PreviewToolbarToggle visible={false} onToggle={() => setToolbarVisible(true)} />
        </div>
      )}
      <PanZoomImage
        src={result.src}
        fallbackSrc={result.fallbackSrc}
        alt={t("studio.generatedPreviewAlt")}
      />
    </div>
  );
}

export function VideoPreviewPanel({
  result,
  onZoom,
  onDownload,
  onEdit,
  onOpenMergeVideos: _onOpenMergeVideos,
  resultActionLabel,
  onResultAction,
}: {
  result: StudioResult;
  onZoom: () => void;
  onDownload: () => Promise<void>;
  onEdit: () => void;
  onOpenMergeVideos: () => void;
  resultActionLabel?: string;
  onResultAction?: () => void;
}) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [videoLoadFailed, setVideoLoadFailed] = useState(false);
  const [toolbarVisible, setToolbarVisible] = usePreviewToolbarVisibility();

  useEffect(() => {
    setVideoLoadFailed(false);
  }, [result.src]);

  const runDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await onDownload();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-black">
      {toolbarVisible ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-black/18 via-black/6 to-transparent" />
          <div className="absolute right-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-col items-end gap-2">
            <div className={PREVIEW_TOOLBAR_CLASS}>
              <PreviewToolbarToggle visible onToggle={() => setToolbarVisible(false)} />
              <Button
                size="sm"
                variant="ghost"
                onClick={onZoom}
                title={t("studio.fullscreen")}
                className={PREVIEW_TOOL_BUTTON_CLASS}
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (!videoRef.current) return;
                  videoRef.current.currentTime = 0;
                  void videoRef.current.play();
                }}
                title={t("studio.replayVideo")}
                className={PREVIEW_TOOL_BUTTON_CLASS}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMuted((value) => !value)}
                title={muted ? t("studio.unmuteVideo") : t("studio.muteVideo")}
                className={PREVIEW_TOOL_BUTTON_CLASS}
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
              {!onResultAction ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onEdit}
                  className={PREVIEW_TOOL_BUTTON_CLASS}
                  title={t("studio.videoEditor.open")}
                >
                  <Scissors className="mr-1.5 h-3.5 w-3.5" /> {t("studio.videoEditor.open")}
                </Button>
              ) : null}
              {onResultAction ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onResultAction}
                  className={PREVIEW_TOOL_ACCENT_BUTTON_CLASS}
                  title={resultActionLabel ?? t("studio.editor.importAction")}
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  {resultActionLabel ?? t("studio.editor.importAction")}
                </Button>
              ) : null}
              <Button
                size="sm"
                disabled={downloading}
                onClick={() => void runDownload()}
                className="border border-white/20 bg-white/[0.18] text-white shadow-sm backdrop-blur-xl hover:bg-white/[0.30] hover:text-white"
              >
                {downloading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                )}
                {t("studio.downloadVideo")}
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="absolute right-3 top-3 z-20">
          <PreviewToolbarToggle visible={false} onToggle={() => setToolbarVisible(true)} />
        </div>
      )}
      <div className="relative flex h-full min-h-0 w-full flex-1 items-center justify-center overflow-hidden p-3">
        <video
          ref={videoRef}
          controls
          src={result.src}
          muted={muted}
          playsInline
          preload="metadata"
          onLoadedData={() => setVideoLoadFailed(false)}
          onError={() => setVideoLoadFailed(true)}
          className={cn(
            "h-auto max-h-full w-auto max-w-full object-contain",
            videoLoadFailed ? "opacity-20" : "",
          )}
        />
        {videoLoadFailed ? (
          <div className="absolute left-1/2 top-1/2 z-10 flex w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-lg border border-destructive/30 bg-black/75 px-5 py-4 text-center text-white shadow-lg backdrop-blur">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/20 text-destructive">
              <FileVideo className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-semibold">{t("studio.videoLoadFailed")}</p>
            <p className="mt-1 text-xs leading-relaxed text-white/65">
              {t("studio.videoLoadFailedDesc")}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function FailedJobPreview({
  job,
  mode,
  onRetry,
}: {
  job: GenerationJobPublic;
  mode: StudioMode;
  onRetry: () => void;
}) {
  const { t, locale } = useI18n();
  const notice = studioGenerationErrorNotice({
    rawMessage: job.errorMessage,
    t,
  });
  const isRetriable = job.status === "failed";

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center overflow-hidden bg-[#050507] p-6 text-center">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-35" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.16),transparent_48%)]" />
      <div className="relative flex max-w-md flex-col items-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/15 text-destructive shadow-sm">
          <X className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-white">{t("studio.generationFailed")}</h3>
        <p className="mt-2 text-sm leading-relaxed text-white/70">{notice.message}</p>
        {notice.safetyBlocked && notice.description ? (
          <p className="mt-1.5 text-xs leading-relaxed text-white/50">{notice.description}</p>
        ) : null}
        <div className="mt-4 w-full rounded-md border border-white/10 bg-white/[0.04] p-3 text-left">
          <p className="line-clamp-3 text-xs leading-relaxed text-white/80">{job.prompt}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-white/45">
            <span>{job.modelDisplayName || job.modelCode}</span>
            <span>{formatDateTime(job.createdAt, locale)}</span>
          </div>
        </div>
        {isRetriable ? (
          <Button
            type="button"
            onClick={onRetry}
            className="mt-5 bg-gradient-primary px-4 shadow-glow hover:opacity-90"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            {t("studio.regenerate")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function normalizedJobProgress(job: GenerationJobPublic) {
  if (job.status === "succeeded" || job.status === "failed" || job.status === "canceled")
    return 100;
  if (typeof job.progress !== "number" || !Number.isFinite(job.progress)) return 0;
  return Math.min(100, Math.max(0, Math.round(job.progress)));
}

function historyStripPreviewSrc(item: StudioResult | undefined) {
  if (!item) return undefined;
  return (
    item.thumbnailSrc ??
    jobOutputContentUrl(item, "thumbnail") ??
    ossThumbnailUrl(jobOutputContentUrl(item) ?? item.src)
  );
}

function fallbackHistoryResultsFromJob(
  job: GenerationJobPublic,
  mode: StudioMode,
  idPrefix: string,
): StudioResult[] {
  const params =
    job.params && typeof job.params === "object" && !Array.isArray(job.params) ? job.params : {};
  const urls = [
    ...(Array.isArray(job.outputUrls) ? job.outputUrls : []),
    ...(Array.isArray(job.providerOutputUrls) ? job.providerOutputUrls : []),
    ...(Array.isArray(params.outputUrls) ? params.outputUrls : []),
    ...(Array.isArray(params.providerOutputUrls) ? params.providerOutputUrls : []),
    ...(Array.isArray(params.imageUrls) ? params.imageUrls : []),
    ...(Array.isArray(params.images) ? params.images : []),
  ].filter((url): url is string => typeof url === "string" && url.trim().length > 0);
  const seen = new Set<string>();
  return urls
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .filter((url) => mode === "video" || mediaKindFromUrl(url) === "image")
    .map((url, index) => ({
      id: `${idPrefix}-fallback-${index}`,
      src: url,
      kind: mode,
      prompt: job.prompt,
      chatSessionId: job.chatSessionId ?? undefined,
      jobId: job.id,
      outputIndex: index,
    }));
}

function historyResultsFromJob(job: GenerationJobPublic, mode: StudioMode, idPrefix: string) {
  const results = studioResultsFromJob(job, job.prompt, mode, idPrefix);
  return results.length ? results : fallbackHistoryResultsFromJob(job, mode, idPrefix);
}

export function StudioJobHistoryStrip({
  jobs,
  loading,
  refreshing = false,
  activeJobId,
  mode,
  onRefresh,
  onPreviewJob,
  onRetry,
}: {
  jobs: GenerationJobPublic[];
  loading: boolean;
  refreshing?: boolean;
  activeJobId?: string | null;
  mode: StudioMode;
  onRefresh?: () => void;
  onPreviewJob: (job: GenerationJobPublic) => void;
  onRetry?: (job: GenerationJobPublic) => void;
}) {
  const { t, locale } = useI18n();
  const expectedTypes =
    mode === "video" ? new Set(["IMAGE2VIDEO"]) : new Set(["TEXT2IMAGE", "IMAGE_EDIT"]);
  const visibleJobs = jobs.filter((job) => expectedTypes.has(job.type));
  const title = mode === "video" ? t("studio.videoJobs.title") : t("studio.imageJobs.title");
  const description =
    mode === "video" ? t("studio.videoJobs.description") : t("studio.imageJobs.description");
  const empty = mode === "video" ? t("studio.videoJobs.empty") : t("studio.imageJobs.empty");

  return (
    <div className="shrink-0 border-t border-border/70 bg-background/75 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-muted-foreground">{title}</p>
          <p className="truncate text-[11px] text-muted-foreground">{description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
          {onRefresh ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={onRefresh}
              disabled={loading || refreshing}
              aria-label={t("studio.jobs.refresh")}
              title={t("studio.jobs.refresh")}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing ? "animate-spin" : "")} />
            </Button>
          ) : null}
        </div>
      </div>
      {visibleJobs.length ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {visibleJobs.map((job) => {
            const progress = normalizedJobProgress(job);
            const active = job.id === activeJobId;
            const previewItems = historyResultsFromJob(job, mode, `strip-${job.id}`);
            const preview = historyStripPreviewSrc(previewItems[0]);
            const canPreview =
              (job.status === "succeeded" && previewItems.length > 0) ||
              job.status === "failed" ||
              job.status === "canceled";
            const failed = job.status === "failed" || job.status === "canceled";
            const errorNotice = failed
              ? studioGenerationErrorNotice({
                  rawMessage: job.errorMessage,
                  t,
                })
              : null;
            return (
              <div
                key={job.id}
                role="button"
                tabIndex={canPreview ? 0 : -1}
                aria-disabled={!canPreview}
                onClick={() => (canPreview ? onPreviewJob(job) : undefined)}
                onKeyDown={(event) => {
                  if (!canPreview || (event.key !== "Enter" && event.key !== " ")) return;
                  event.preventDefault();
                  onPreviewJob(job);
                }}
                className={cn(
                  "grid w-64 shrink-0 grid-cols-[56px_minmax(0,1fr)] gap-2 rounded-md border bg-card/75 p-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? failed
                      ? "border-destructive/60 ring-1 ring-destructive/25"
                      : "border-primary/70 ring-1 ring-primary/30"
                    : failed
                      ? "border-destructive/30"
                      : "border-border/70",
                  canPreview ? "cursor-pointer hover:bg-secondary/35" : "cursor-default opacity-85",
                )}
              >
                <div
                  className={cn(
                    "flex h-14 w-14 items-center justify-center overflow-hidden rounded bg-black transition",
                    failed ? "bg-destructive/10 text-destructive" : "",
                  )}
                >
                  {failed ? (
                    <X className="h-5 w-5" />
                  ) : mode === "video" ? (
                    <Video className="h-5 w-5 text-white/65" />
                  ) : preview ? (
                    <img
                      src={preview}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-white/65" />
                  )}
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <StatusBadge status={job.status} />
                    <div className="flex items-center gap-1">
                      {onRetry ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRetry(job);
                          }}
                          className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] text-primary hover:bg-primary/10"
                          title={t("studio.regenerate")}
                        >
                          <RotateCcw className="h-3 w-3" />
                          {t("studio.regenerate")}
                        </button>
                      ) : null}
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {progress}%
                      </span>
                    </div>
                  </div>
                  <p className="line-clamp-1 text-xs">{job.prompt}</p>
                  {errorNotice ? (
                    <p className="line-clamp-2 text-[10px] leading-snug text-destructive">
                      {errorNotice.message}
                    </p>
                  ) : null}
                  <Progress value={progress} className="h-1" />
                  <p className="truncate text-[10px] text-muted-foreground">
                    {formatDateTime(job.createdAt, locale)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
          {loading ? t("common.loading") : empty}
        </div>
      )}
    </div>
  );
}

export function FallbackImage({
  src,
  fallbackSrc,
  alt,
  className,
}: {
  src: string;
  fallbackSrc?: string;
  alt: string;
  className?: string;
}) {
  const [activeSrc, setActiveSrc] = useState(src);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setActiveSrc(src);
    setLoading(true);
  }, [src]);

  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => {
      if (fallbackSrc && activeSrc !== fallbackSrc) {
        setActiveSrc(fallbackSrc);
        setLoading(true);
        return;
      }
      setLoading(false);
    }, 12000);
    return () => window.clearTimeout(timer);
  }, [activeSrc, fallbackSrc, loading]);

  return (
    <div className="relative flex max-h-[88vh] w-full items-center justify-center">
      {loading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-black/50 backdrop-blur-sm">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : null}
      <img
        key={activeSrc}
        src={activeSrc}
        alt={alt}
        className={cn(className, loading ? "opacity-0" : "opacity-100")}
        onLoad={() => setLoading(false)}
        onError={() => {
          if (fallbackSrc && activeSrc !== fallbackSrc) {
            setActiveSrc(fallbackSrc);
            setLoading(true);
          } else {
            setLoading(false);
          }
        }}
      />
    </div>
  );
}

function PanZoomImage({
  src,
  fallbackSrc,
  alt,
}: {
  src: string;
  fallbackSrc?: string;
  alt: string;
}) {
  const { t } = useI18n();
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const dragRef = useRef<{
    pan: { x: number; y: number };
    point: { x: number; y: number };
    pinchDistance?: number;
    scale?: number;
  } | null>(null);
  const [imageSize, setImageSize] = useState({ w: 1, h: 1 });
  const [viewportSize, setViewportSize] = useState({ w: 1, h: 1 });
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [activeSrc, setActiveSrc] = useState(src);
  const [imageLoading, setImageLoading] = useState(true);
  const scaleRef = useRef(scale);
  const panRef = useRef(pan);

  const fitScale = useMemo(() => {
    if (!imageSize.w || !imageSize.h || !viewportSize.w || !viewportSize.h) return 1;
    return Math.min(viewportSize.w / imageSize.w, viewportSize.h / imageSize.h);
  }, [imageSize, viewportSize]);

  const resetView = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const update = () =>
      setViewportSize({
        w: Math.max(viewport.clientWidth, 1),
        h: Math.max(viewport.clientHeight, 1),
      });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setActiveSrc(src);
    setImageLoading(true);
    setImageSize({ w: 1, h: 1 });
    resetView();
    pointersRef.current.clear();
    dragRef.current = null;
  }, [src, resetView]);

  useEffect(() => {
    if (!imageLoading) return;
    const timer = window.setTimeout(() => {
      if (fallbackSrc && activeSrc !== fallbackSrc) {
        setActiveSrc(fallbackSrc);
        setImageLoading(true);
        return;
      }
      setImageLoading(false);
    }, 12000);
    return () => window.clearTimeout(timer);
  }, [activeSrc, fallbackSrc, imageLoading]);

  const clampScale = (next: number) => Math.min(Math.max(next, 0.35), 8);

  const zoomAt = (client: { x: number; y: number }, nextScale: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const origin = {
      x: client.x - rect.left - viewportSize.w / 2,
      y: client.y - rect.top - viewportSize.h / 2,
    };
    setScale((currentScale) => {
      const clamped = clampScale(nextScale);
      const ratio = clamped / currentScale;
      setPan((currentPan) => ({
        x: origin.x - (origin.x - currentPan.x) * ratio,
        y: origin.y - (origin.y - currentPan.y) * ratio,
      }));
      return clamped;
    });
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    zoomAt({ x: e.clientX, y: e.clientY }, scale * factor);
  };

  const pointerAverage = () => {
    const points = [...pointersRef.current.values()];
    return {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    };
  };

  const pointerDistance = () => {
    const [a, b] = [...pointersRef.current.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const average = pointerAverage();
    dragRef.current = {
      point: average,
      pan: panRef.current,
      scale: scaleRef.current,
      pinchDistance: pointersRef.current.size > 1 ? pointerDistance() : undefined,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId) || !dragRef.current) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const average = pointerAverage();
    const dx = average.x - dragRef.current.point.x;
    const dy = average.y - dragRef.current.point.y;

    if (pointersRef.current.size > 1 && dragRef.current.pinchDistance && dragRef.current.scale) {
      const nextScale = clampScale(
        dragRef.current.scale * (pointerDistance() / dragRef.current.pinchDistance),
      );
      setScale(nextScale);
    }

    setPan({
      x: dragRef.current.pan.x + dx,
      y: dragRef.current.pan.y + dy,
    });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size) {
      dragRef.current = {
        point: pointerAverage(),
        pan: panRef.current,
        scale: scaleRef.current,
        pinchDistance: pointersRef.current.size > 1 ? pointerDistance() : undefined,
      };
    } else {
      dragRef.current = null;
    }
  };

  const renderedWidth = imageSize.w * fitScale;
  const renderedHeight = imageSize.h * fitScale;

  return (
    <div
      ref={viewportRef}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={resetView}
      className="relative h-full w-full cursor-grab touch-none select-none overflow-hidden bg-[#050507] active:cursor-grabbing"
    >
      {imageLoading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-xs text-white/75">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            {t("studio.loadingImage")}
          </div>
        </div>
      ) : null}
      <div
        className="absolute left-1/2 top-1/2 will-change-transform"
        style={{
          width: renderedWidth,
          height: renderedHeight,
          transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${scale})`,
        }}
      >
        <img
          key={activeSrc}
          src={activeSrc}
          alt={alt}
          draggable={false}
          onLoad={(e) => {
            setImageSize({
              w: e.currentTarget.naturalWidth || 1,
              h: e.currentTarget.naturalHeight || 1,
            });
            setImageLoading(false);
          }}
          onError={() => {
            if (fallbackSrc && activeSrc !== fallbackSrc) {
              setActiveSrc(fallbackSrc);
              setImageLoading(true);
            } else {
              setImageLoading(false);
            }
          }}
          className={cn(
            "h-full w-full object-contain transition-opacity",
            imageLoading ? "opacity-0" : "opacity-100",
          )}
        />
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/45 px-2.5 py-1 text-[11px] text-white/70 backdrop-blur">
        {t("studio.zoomPercent", { percent: Math.round(scale * 100) })}
      </div>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={resetView}
        className="absolute bottom-3 right-3 h-8 bg-black/45 text-white/80 backdrop-blur hover:bg-black/65 hover:text-white"
        title={t("studio.resetCanvas")}
      >
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
        {t("studio.reset")}
      </Button>
    </div>
  );
}

export function EmptyPreview({ mode }: { mode: StudioMode }) {
  const { t } = useI18n();
  const isVideo = mode === "video";
  const tips = isVideo
    ? [
        { icon: <MessageSquare className="h-3 w-3" />, text: t("studio.tip.videoPrompt") },
        { icon: <Video className="h-3 w-3" />, text: t("studio.tip.videoPreview") },
        { icon: <Scissors className="h-3 w-3" />, text: t("studio.tip.videoEdit") },
        { icon: <Repeat className="h-3 w-3" />, text: t("studio.tip.videoReference") },
      ]
    : [
        { icon: <Wand2 className="h-3 w-3" />, text: t("studio.tip.inspire") },
        { icon: <Edit3 className="h-3 w-3" />, text: t("studio.tip.canvas") },
        { icon: <Repeat className="h-3 w-3" />, text: t("studio.tip.reference") },
        { icon: <Copy className="h-3 w-3" />, text: t("studio.tip.paste") },
      ];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-4 text-center text-card-foreground">
      <div className="pointer-events-none absolute inset-0 bg-gradient-radial-glow opacity-35" />
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-60" />
      <div className="relative inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
        {isVideo ? (
          <Video className="h-6 w-6 text-primary-foreground" />
        ) : (
          <ImageIcon className="h-6 w-6 text-primary-foreground" />
        )}
      </div>
      <h3 className="relative text-base font-semibold">
        {isVideo ? t("studio.previewPanel.videoTitle") : t("studio.previewPanel.imageTitle")}
      </h3>
      <p className="relative max-w-md text-xs text-muted-foreground">
        {isVideo
          ? t("studio.previewPanel.videoDescription")
          : t("studio.previewPanel.imageDescription")}
      </p>
      <div className="relative mt-4 grid max-w-md grid-cols-2 gap-2 text-[11px] text-muted-foreground">
        {tips.map((tip) => (
          <Tip key={tip.text} icon={tip.icon} text={tip.text} />
        ))}
      </div>
    </div>
  );
}

function Tip({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/75 p-2 shadow-sm backdrop-blur">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-secondary text-primary">
        {icon}
      </span>
      <span>{text}</span>
    </div>
  );
}
