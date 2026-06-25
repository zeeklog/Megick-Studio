import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Crop, Film, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { StudioResult } from "@/routes/-dashboard-types";

function mediaRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForVideoMetadata(video: HTMLVideoElement) {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
    };
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Video metadata failed to load"));
    };
    video.addEventListener("loadedmetadata", onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function waitForVideoSeek(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Video seek failed"));
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function formatSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0.0s";
  return `${seconds.toFixed(1)}s`;
}

async function exportEditedVideo(input: {
  src: string;
  trimStart: number;
  trimEnd: number;
  cropX: number;
  cropY: number;
  cropScale: number;
  speed: number;
  muted: boolean;
}) {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.playsInline = true;
  video.muted = input.muted;
  video.src = input.src;
  await waitForVideoMetadata(video);

  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  const trimStart = Math.max(0, Math.min(input.trimStart, duration));
  const trimEnd = Math.max(
    trimStart + 0.1,
    Math.min(input.trimEnd || duration, duration || input.trimEnd),
  );
  const sourceW = Math.max(video.videoWidth || 1280, 1);
  const sourceH = Math.max(video.videoHeight || 720, 1);
  const cropScale = Math.max(1, Math.min(input.cropScale, 3));
  const cropW = Math.max(1, sourceW / cropScale);
  const cropH = Math.max(1, sourceH / cropScale);
  const sx = Math.max(0, Math.min(sourceW - cropW, (sourceW - cropW) * (input.cropX / 100)));
  const sy = Math.max(0, Math.min(sourceH - cropH, (sourceH - cropH) * (input.cropY / 100)));
  const exportScale = Math.min(1, 1920 / Math.max(cropW, cropH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(cropW * exportScale));
  canvas.height = Math.max(1, Math.round(cropH * exportScale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context is unavailable");
  if (!canvas.captureStream || typeof MediaRecorder === "undefined") {
    throw new Error("Browser video export APIs are unavailable");
  }

  const stream = canvas.captureStream(30);
  if (!input.muted) {
    const captureStream = (video as HTMLVideoElement & { captureStream?: () => MediaStream })
      .captureStream;
    const audioStream = captureStream?.call(video);
    audioStream?.getAudioTracks().forEach((track) => stream.addTrack(track));
  }

  const chunks: Blob[] = [];
  const mimeType = mediaRecorderMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => reject(new Error("Video recording failed"));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || "video/webm" }));
  });

  if (Math.abs(video.currentTime - trimStart) > 0.01) {
    const seeked = waitForVideoSeek(video);
    video.currentTime = trimStart;
    await seeked;
  }
  video.playbackRate = Math.max(0.25, Math.min(input.speed, 2));

  let frameId = 0;
  const stop = () => {
    if (frameId) cancelAnimationFrame(frameId);
    video.pause();
    stream.getTracks().forEach((track) => track.stop());
    if (recorder.state !== "inactive") recorder.stop();
  };
  const draw = () => {
    ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height);
    if (video.currentTime >= trimEnd || video.ended) {
      stop();
      return;
    }
    frameId = requestAnimationFrame(draw);
  };

  recorder.start(250);
  await video.play();
  draw();
  return stopped;
}

export async function exportMergedVideo(
  videos: StudioResult[],
  fetchMediaBlob: (item: StudioResult) => Promise<Blob>,
  objectUrlFromBlob: (blob: Blob) => string,
) {
  if (videos.length < 2) throw new Error("Select at least two videos");
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Browser video export APIs are unavailable");
  }
  const objectUrls: string[] = [];
  const sourceUrlFor = async (item: StudioResult) => {
    const blob = await fetchMediaBlob(item);
    const url = objectUrlFromBlob(blob);
    objectUrls.push(url);
    return url;
  };

  const first = document.createElement("video");
  first.crossOrigin = "anonymous";
  first.preload = "auto";
  first.playsInline = true;
  first.muted = true;
  first.src = await sourceUrlFor(videos[0]);
  await waitForVideoMetadata(first);

  const sourceW = Math.max(first.videoWidth || 1280, 1);
  const sourceH = Math.max(first.videoHeight || 720, 1);
  const exportScale = Math.min(1, 1920 / Math.max(sourceW, sourceH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceW * exportScale));
  canvas.height = Math.max(1, Math.round(sourceH * exportScale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context is unavailable");
  if (!canvas.captureStream) {
    throw new Error("Browser video export APIs are unavailable");
  }

  const stream = canvas.captureStream(30);
  const chunks: Blob[] = [];
  const mimeType = mediaRecorderMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const stopped = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => reject(new Error("Video recording failed"));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || "video/webm" }));
  });

  const drawVideo = (video: HTMLVideoElement) => {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const videoW = Math.max(video.videoWidth || sourceW, 1);
    const videoH = Math.max(video.videoHeight || sourceH, 1);
    const scale = Math.min(canvas.width / videoW, canvas.height / videoH);
    const drawW = videoW * scale;
    const drawH = videoH * scale;
    ctx.drawImage(video, (canvas.width - drawW) / 2, (canvas.height - drawH) / 2, drawW, drawH);
  };

  recorder.start(250);
  try {
    for (const item of videos) {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.preload = "auto";
      video.playsInline = true;
      video.muted = true;
      video.src = item === videos[0] ? first.src : await sourceUrlFor(item);
      await waitForVideoMetadata(video);
      video.currentTime = 0;
      let frameId = 0;
      const frameDone = new Promise<void>((resolve, reject) => {
        const draw = () => {
          drawVideo(video);
          if (video.ended || video.currentTime >= (video.duration || 0)) {
            if (frameId) cancelAnimationFrame(frameId);
            resolve();
            return;
          }
          frameId = requestAnimationFrame(draw);
        };
        video.addEventListener("error", () => reject(new Error("Video playback failed")), {
          once: true,
        });
        void video.play().then(draw).catch(reject);
      });
      await frameDone;
      video.pause();
      await sleep(80);
    }
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    if (recorder.state !== "inactive") recorder.stop();
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
  }

  return stopped;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SessionVideoMediaCenter({
  videos,
  onMerge,
  onClose,
}: {
  videos: StudioResult[];
  onMerge: (videos: StudioResult[]) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(videos.map((video) => video.id)),
  );
  const [merging, setMerging] = useState(false);
  const selectedVideos = videos.filter((video) => selectedIds.has(video.id));
  const allSelected = videos.length > 0 && selectedIds.size === videos.length;

  useEffect(() => {
    setSelectedIds((current) => {
      const available = new Set(videos.map((video) => video.id));
      const next = new Set([...current].filter((id) => available.has(id)));
      if (next.size === 0 && videos.length > 0) {
        videos.forEach((video) => next.add(video.id));
      }
      return next;
    });
  }, [videos]);

  const toggleOne = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const runMerge = async () => {
    if (selectedVideos.length < 2) {
      toast.error(t("studio.mergeVideos.needTwo"));
      return;
    }
    setMerging(true);
    try {
      await onMerge(selectedVideos);
      toast.success(t("studio.mergeVideos.success", { count: selectedVideos.length }));
      onClose();
    } catch (err) {
      toast.error(t("studio.mergeVideos.failed"), {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setMerging(false);
    }
  };

  if (videos.length === 0) {
    return (
      <div className="flex min-h-52 items-center justify-center rounded-lg border border-border/70 bg-secondary/20 text-sm text-muted-foreground">
        {t("studio.mediaCenter.empty")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(checked) => {
              setSelectedIds(checked ? new Set(videos.map((video) => video.id)) : new Set());
            }}
          />
          {t("common.selectAll")}
        </label>
        <span className="text-xs text-muted-foreground">
          {t("studio.mediaCenter.selected", {
            selected: selectedVideos.length,
            total: videos.length,
          })}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((video, index) => {
          const checked = selectedIds.has(video.id);
          return (
            <div
              key={video.id}
              className={cn(
                "group overflow-hidden rounded-lg border bg-card transition",
                checked ? "border-primary shadow-glow" : "border-border/70 hover:border-primary/70",
              )}
            >
              <div className="relative aspect-video bg-black">
                <video
                  src={video.src}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover"
                />
                <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-0.5 text-[10px] text-white">
                  #{index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => toggleOne(video.id)}
                  className={cn(
                    "absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/15 bg-background/90 text-muted-foreground shadow-sm transition hover:text-foreground",
                    checked
                      ? "bg-primary text-primary-foreground hover:text-primary-foreground"
                      : "",
                  )}
                  aria-pressed={checked}
                  aria-label={checked ? t("studio.unselectMedia") : t("studio.selectMedia")}
                >
                  {checked ? <Check className="h-4 w-4" /> : null}
                </button>
              </div>
              <div className="space-y-1 p-2">
                <button
                  type="button"
                  onClick={() => toggleOne(video.id)}
                  className="line-clamp-2 w-full rounded-sm text-left text-xs text-foreground outline-none transition hover:text-primary focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {video.prompt}
                </button>
                <p className="text-[10px] text-muted-foreground">
                  {video.createdAt ? new Date(video.createdAt).toLocaleString() : t("common.video")}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={merging}>
          {t("common.cancel")}
        </Button>
        <Button
          type="button"
          className="bg-gradient-primary shadow-glow hover:opacity-90"
          disabled={merging || selectedVideos.length < 2}
          onClick={() => void runMerge()}
        >
          {merging ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Film className="mr-1.5 h-3.5 w-3.5" />
          )}
          {merging ? t("studio.mergeVideos.merging") : t("studio.mergeVideos.create")}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function VideoEditor({ src, prompt }: { src: string; prompt: string }) {
  const { t } = useI18n();
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [cropX, setCropX] = useState(50);
  const [cropY, setCropY] = useState(50);
  const [cropScale, setCropScale] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(true);
  const [exporting, setExporting] = useState(false);
  const durationReady = duration > 0;
  const effectiveEnd = trimEnd || duration;
  const safeStart = Math.min(trimStart, Math.max(0, effectiveEnd - 0.1));
  const safeEnd = Math.max(safeStart + 0.1, Math.min(effectiveEnd, duration || effectiveEnd));

  useEffect(() => {
    setDuration(0);
    setTrimStart(0);
    setTrimEnd(0);
    setCropX(50);
    setCropY(50);
    setCropScale(1);
    setSpeed(1);
    setMuted(true);
  }, [src]);

  const previewCropStyle = {
    transform: `scale(${cropScale}) translate(${(50 - cropX) / cropScale}%, ${(50 - cropY) / cropScale}%)`,
  };

  const seekPreview = (video: HTMLVideoElement | null, nextTime: number) => {
    if (!video || !durationReady) return;
    video.currentTime = Math.max(0, Math.min(nextTime, duration));
  };

  const runExport = async () => {
    if (!durationReady) {
      toast.error(t("studio.videoEditor.durationUnavailable"));
      return;
    }
    setExporting(true);
    try {
      const blob = await exportEditedVideo({
        src,
        trimStart: safeStart,
        trimEnd: safeEnd,
        cropX,
        cropY,
        cropScale,
        speed,
        muted,
      });
      saveBlob(blob, `megick-video-edit-${Date.now()}.webm`);
    } catch (err) {
      toast.error(t("studio.videoEditor.exportFailed"), {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("studio.videoEditor.description")}</p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.8fr)]">
        <div className="space-y-3">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
            <video
              src={src}
              controls
              muted={muted}
              onLoadedMetadata={(event) => {
                const nextDuration = Number.isFinite(event.currentTarget.duration)
                  ? event.currentTarget.duration
                  : 0;
                setDuration(nextDuration);
                setTrimEnd(nextDuration);
              }}
              className="h-full w-full object-cover transition-transform duration-200"
              style={previewCropStyle}
            />
          </div>
          <p className="line-clamp-2 text-xs text-muted-foreground">{prompt}</p>
        </div>

        <div className="space-y-4 rounded-xl border border-border bg-background/60 p-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium">
              <span>{t("studio.videoEditor.trimStart")}</span>
              <span>{formatSeconds(safeStart)}</span>
            </div>
            <Slider
              value={[safeStart]}
              min={0}
              max={durationReady ? Math.max(duration - 0.1, 0.1) : 1}
              step={0.1}
              disabled={!durationReady}
              onValueChange={(value) => {
                const next = value[0] ?? 0;
                setTrimStart(Math.min(next, Math.max(0, safeEnd - 0.1)));
              }}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-medium">
              <span>{t("studio.videoEditor.trimEnd")}</span>
              <span>{formatSeconds(safeEnd)}</span>
            </div>
            <Slider
              value={[safeEnd]}
              min={durationReady ? Math.min(safeStart + 0.1, duration) : 0}
              max={durationReady ? duration : 1}
              step={0.1}
              disabled={!durationReady}
              onValueChange={(value) => {
                const next = value[0] ?? duration;
                setTrimEnd(Math.max(next, safeStart + 0.1));
              }}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <VideoSlider
              label={t("studio.videoEditor.cropX")}
              value={cropX}
              min={0}
              max={100}
              step={1}
              suffix="%"
              onChange={setCropX}
            />
            <VideoSlider
              label={t("studio.videoEditor.cropY")}
              value={cropY}
              min={0}
              max={100}
              step={1}
              suffix="%"
              onChange={setCropY}
            />
          </div>
          <VideoSlider
            label={t("studio.videoEditor.cropScale")}
            value={cropScale}
            min={1}
            max={3}
            step={0.05}
            suffix="x"
            onChange={setCropScale}
          />
          <VideoSlider
            label={t("studio.videoEditor.speed")}
            value={speed}
            min={0.25}
            max={2}
            step={0.25}
            suffix="x"
            onChange={setSpeed}
          />
          <label className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-3 py-2 text-sm">
            <span>{t("studio.videoEditor.mute")}</span>
            <input
              type="checkbox"
              checked={muted}
              onChange={(event) => setMuted(event.target.checked)}
            />
          </label>
          <Button
            type="button"
            className="w-full bg-gradient-primary shadow-glow hover:opacity-90"
            disabled={exporting || !durationReady}
            onClick={() => void runExport()}
          >
            {exporting ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                {t("studio.videoEditor.exporting")}
              </>
            ) : (
              <>
                <Crop className="mr-1.5 h-3.5 w-3.5" />
                {t("studio.videoEditor.export")}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function VideoSlider({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-medium">
        <span>{label}</span>
        <span>
          {Number.isInteger(value) ? value : value.toFixed(2)}
          {suffix}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => onChange(next[0] ?? value)}
      />
    </div>
  );
}
