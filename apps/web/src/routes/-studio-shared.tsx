import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  AIImageEditModePublic,
  AIModelPublic,
  GenerationJobPublic,
  PromptTemplatePublic,
  StudioEditedResultPublic,
  VideoModelInputMode,
} from "@megick/api-types";
import {
  Check,
  Copy,
  CreditCard,
  Download,
  Film,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  MessageSquare,
  Repeat,
  Scissors,
  Eraser,
  SquareDashedMousePointer,
  Expand,
  Type,
  Send,
  Video,
  Settings2,
  Hash,
  Layers,
  Sparkles,
  Wand2,
  Edit3,
  Maximize2,
  RotateCcw,
  X,
} from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { DEFAULT_CHAT_TITLE, displayChatTitle, persistedChatTitle } from "@/lib/chat-title";
import { uploadDirectOssAsset } from "@/lib/oss-upload";
import { cn } from "@/lib/utils";
import {
  STYLE_PRESETS,
  RATIO_PRESETS,
  buildFinalPrompt,
  ratioToSize,
} from "@/components/studio/presets";
import { styleLabelKey, useI18n } from "@/lib/i18n";
import {
  type StudioMode,
  type StudioSettings,
  type StudioResult,
  type StudioMessage,
  type ChatSession,
  type ChatSessionDetail,
  defaultStudioSettings,
  clampStudioVideoDuration,
  newStudioId,
  titleFromPrompt,
  studioMessageFromRecord,
  collectStudioResults,
  studioResultsFromJob,
  studioPathForMode,
  modeForChatSession,
  readLastStudioSessionId,
  rememberLastStudioSessionId,
  VIDEO_DURATION_MAX_SECONDS,
  VIDEO_DURATION_MIN_SECONDS,
} from "./-dashboard-types";
import { type StudioSearch } from "./-studio-search";
import { EmptyState, formatDateTime } from "./-dashboard-components";
import {
  EmptyPreview,
  FailedJobPreview,
  ImagePreviewPanel,
  StudioJobHistoryStrip,
  VideoPreviewPanel,
} from "@/components/studio/panel/preview-panels";
import {
  GenerationPlaceholderGrid,
  GenerationPreviewPlaceholder,
} from "@/components/studio/panel/placeholders";
import {
  apiErrorStatus,
  asPlainRecord,
  blobToDataUrl,
  createDefaultVideoDrafts,
  defaultVideoModeForModels,
  defaultVideoSettingsForMode,
  downloadCandidates,
  estimatedGenerationCredits,
  extensionFromName,
  handoffReferenceName,
  imageExtension,
  isTruthySearchFlag,
  loadBrowserImage,
  mediaKindFromUrl,
  normalizeReferenceInput,
  normalizeVideoDraft,
  normalizeVideoMode,
  ratioParts,
  readStudioHandoff,
  referenceBoundsForModel,
  referenceCandidates,
  referenceKindFromFile,
  referenceMediaTypeFor,
  refsFromGenerationJobParams,
  settingsPatchFromGenerationJob,
  templateReferenceUrls,
  validateReferenceVideoDuration,
  withVideoReferenceTypes,
  writeStudioHandoff,
} from "@/components/studio/panel/utils";
import { studioGenerationErrorNotice } from "@/components/studio/panel/generation-error-presenter";
import { localizedImageEditModeName } from "@/lib/studio-i18n";
import type {
  ConcreteVideoInputMode,
  StudioEditTarget,
  StudioGenerationPayload,
  StudioHandoff,
  StudioMediaReference,
  StudioReference,
  StudioReferenceKind,
  StudioResultAction,
  StudioResultActionPayload,
  StudioVideoMediaType,
  VideoModeDraft,
  VideoModeDrafts,
} from "@/components/studio/panel/types";
import {
  REFERENCE_UPLOAD_PREFIX,
  FALLBACK_REFERENCE_MAX_EDGE,
  MAX_STUDIO_REFERENCE_IMAGES,
  MAX_STUDIO_REFERENCE_MEDIA,
  STUDIO_REFERENCE_IMAGE_MAX_BYTES,
  STUDIO_REFERENCE_VIDEO_MAX_BYTES,
  VIDEO_REFERENCE_VIDEO_GENERATION_MAX_SECONDS,
  VIDEO_REFERENCE_VIDEO_GENERATION_MIN_SECONDS,
  VIDEO_REFERENCE_MIN_SECONDS,
  VIDEO_REFERENCE_MAX_SECONDS,
  STUDIO_REFERENCE_IMAGE_EXTENSIONS,
  STUDIO_REFERENCE_VIDEO_EXTENSIONS,
  VIDEO_INPUT_MODES,
  STUDIO_HANDOFF_PREFIX,
} from "@/components/studio/panel/constants";

export type {
  StudioResultAction,
  StudioResultActionPayload,
} from "@/components/studio/panel/types";

const STUDIO_JOB_HISTORY_LIMIT = 10;

// ─── Local ui helper ────────────────────────────────────────────────

function UserPromptText({ text }: { text: string }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const threshold = expanded ? Infinity : 120;
  const compact = text.replace(/\s+/g, " ").trim();
  return (
    <>
      <span className="[overflow-wrap:anywhere]">
        {compact.length > threshold ? `${compact.slice(0, threshold)}...` : compact}
      </span>
      {compact.length > threshold ? (
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setExpanded((prev) => !prev);
          }}
          className="ml-1 inline-flex items-center gap-0.5 rounded bg-white/15 px-1 py-px text-[10px] text-white/85 hover:bg-white/25"
        >
          {expanded ? t("common.collapse") : t("common.expand")}
        </button>
      ) : null}
    </>
  );
}

function studioResultsMatch(candidate: StudioResult, result: StudioResult) {
  if (candidate.id === result.id) return true;
  if (result.jobId && candidate.jobId === result.jobId) {
    if (
      candidate.outputIndex !== undefined &&
      result.outputIndex !== undefined &&
      candidate.outputIndex === result.outputIndex
    ) {
      return true;
    }
    if (candidate.src === result.src) return true;
    if (
      candidate.fallbackSrc &&
      result.fallbackSrc &&
      candidate.fallbackSrc === result.fallbackSrc
    ) {
      return true;
    }
    if (candidate.sourceSrc && result.sourceSrc && candidate.sourceSrc === result.sourceSrc) {
      return true;
    }
  }
  return candidate.src === result.src;
}

function resultFromMessage(message: StudioMessage, result: StudioResult) {
  if (message.role !== "assistant") return undefined;
  return message.results.find((candidate) => studioResultsMatch(candidate, result));
}

// ─── AI Edit mode helpers ───────────────────────────────────────────

type AiImageEditDialogState = {
  mode: AIImageEditModePublic;
  target: StudioEditTarget;
};

export { localizedImageEditModeName };

export function AiEditModeIcon({ mode }: { mode: AIImageEditModePublic }) {
  if (mode.code === "smart-erase") {
    return (
      <span className="relative mr-2 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-rose-500/12 text-rose-500">
        <Eraser className="h-3.5 w-3.5" />
        <Sparkles className="absolute -right-1 -top-1 h-2.5 w-2.5 text-fuchsia-500" />
      </span>
    );
  }
  if (mode.code === "local-replace") {
    return (
      <span className="relative mr-2 grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-lg bg-amber-500/12 text-amber-500">
        <SquareDashedMousePointer className="h-3.5 w-3.5" />
        <span className="absolute inset-x-1 bottom-1 h-0.5 rounded-full bg-amber-400/80 [animation:megick-ai-progress_1.6s_ease-in-out_infinite]" />
      </span>
    );
  }
  if (mode.code === "outpaint") {
    return (
      <span className="relative mr-2 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-cyan-500/12 text-cyan-500">
        <Expand className="h-3.5 w-3.5" />
        <span className="absolute inset-0 rounded-lg border border-cyan-400/40 [animation:pulse_1.7s_ease-in-out_infinite]" />
      </span>
    );
  }
  if (mode.code === "text-edit") {
    return (
      <span className="relative mr-2 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-violet-500/12 text-violet-500">
        <Type className="h-3.5 w-3.5" />
        <Wand2 className="absolute -right-1 -top-1 h-2.5 w-2.5 text-violet-400" />
      </span>
    );
  }
  return (
    <span className="mr-2 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
      <Wand2 className="h-3.5 w-3.5" />
    </span>
  );
}

export function ManualEditModeIcon() {
  return (
    <span className="relative mr-2 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-slate-500/12 text-slate-500 dark:text-slate-300">
      <Edit3 className="h-3.5 w-3.5" />
      <Scissors className="absolute -right-1 -top-1 h-2.5 w-2.5 text-cyan-500" />
    </span>
  );
}

// ─── Pure utility functions ─────────────────────────────────────────

export async function imageBlobFromSource(source: Blob, maxEdge: number, quality = 0.84) {
  const url = URL.createObjectURL(source);
  try {
    const image = await loadBrowserImage(url);
    const width = image.naturalWidth || image.width || 1;
    const height = image.naturalHeight || image.height || 1;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context is unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) throw new Error("Image export failed");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressedImageDataUrl(source: Blob) {
  const blob = await imageBlobFromSource(source, FALLBACK_REFERENCE_MAX_EDGE);
  return blobToDataUrl(blob);
}

export async function uploadStudioAsset(
  file: Blob,
  name: string,
  prefix: string,
  maxSizeBytes?: number,
) {
  const uploaded = await uploadDirectOssAsset({
    file,
    name,
    prefix,
    maxSizeBytes,
  });
  return uploaded?.signedUrl ?? null;
}

export async function referenceSrcFromBlob(
  source: Blob,
  name: string,
  kind: StudioReferenceKind = "image",
) {
  try {
    const uploaded = await uploadStudioAsset(
      source,
      name,
      REFERENCE_UPLOAD_PREFIX,
      kind === "video" ? STUDIO_REFERENCE_VIDEO_MAX_BYTES : STUDIO_REFERENCE_IMAGE_MAX_BYTES,
    );
    if (uploaded) return uploaded;
  } catch {
    // Fall back to a compact data URL when direct OSS upload is unavailable.
  }
  if (kind === "video") {
    throw new Error("Video references require OSS upload to be configured");
  }
  return compressedImageDataUrl(source);
}

export async function blobFromDataUrl(src: string) {
  const res = await fetch(src);
  if (!res.ok) throw new Error("Image failed to load");
  return res.blob();
}

export async function fetchMediaBlob(item: StudioResult) {
  let lastError: unknown;
  for (const src of downloadCandidates(item)) {
    try {
      const res = await fetch(src, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.blob();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Unable to download media");
}

export async function fetchReferenceBlob(item: StudioResult) {
  let lastError: unknown;
  for (const src of referenceCandidates(item)) {
    try {
      const res = await fetch(src, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.blob();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Unable to load reference media");
}

export function mediaExtension(blob: Blob, item: StudioResult) {
  const type = blob.type.toLowerCase();
  if (item.kind === "video") {
    if (type.includes("webm")) return "webm";
    if (type.includes("quicktime")) return "mov";
    return "mp4";
  }
  if (type.includes("jpeg")) return "jpg";
  if (type.includes("webp")) return "webp";
  return "png";
}

export async function referenceSrcFromResult(item: StudioResult) {
  const blob = await fetchReferenceBlob(item);
  return referenceSrcFromBlob(
    blob,
    `megick-reference-${item.id}.${mediaExtension(blob, item)}`,
    item.kind === "video" ? "video" : "image",
  );
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function objectUrlFromBlob(blob: Blob) {
  return URL.createObjectURL(blob);
}

export async function canvasFromImageBlob(blob: Blob) {
  if ("createImageBitmap" in window) {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context is unavailable");
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas;
  }

  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Image failed to load"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context is unavailable");
    ctx.drawImage(image, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function psdBlobFromImageBlob(blob: Blob) {
  const { writePsd } = await import("ag-psd");
  type Psd = import("ag-psd").Psd;
  const compositeCanvas = await canvasFromImageBlob(blob);
  const layerCanvas = document.createElement("canvas");
  layerCanvas.width = compositeCanvas.width;
  layerCanvas.height = compositeCanvas.height;
  const ctx = layerCanvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context is unavailable");
  ctx.drawImage(compositeCanvas, 0, 0);

  const psd: Psd = {
    width: compositeCanvas.width,
    height: compositeCanvas.height,
    canvas: compositeCanvas,
    children: [
      {
        name: "Generated image",
        top: 0,
        left: 0,
        bottom: compositeCanvas.height,
        right: compositeCanvas.width,
        canvas: layerCanvas,
      },
    ],
  };
  const buffer = writePsd(psd, { generateThumbnail: true });
  return new Blob([buffer], { type: "image/vnd.adobe.photoshop" });
}

// ─── Brand helpers ──────────────────────────────────────────────────

function normalizeIncomingVideoMode(
  handoff: StudioHandoff | null,
  searchVideoInputMode: ConcreteVideoInputMode | undefined,
  incomingRefs: Array<{ src: string }>,
): ConcreteVideoInputMode {
  const requestedIncomingMode = normalizeVideoMode(handoff?.videoInputMode ?? searchVideoInputMode);
  const inferredIncomingMode = incomingRefs.some((ref) => mediaKindFromUrl(ref.src) === "video")
    ? "EDIT"
    : incomingRefs.length > 1
      ? "R2V"
      : "I2V";
  return requestedIncomingMode === "I2V" || requestedIncomingMode === "R2V"
    ? requestedIncomingMode
    : inferredIncomingMode;
}

// ─── useStudioSession hook ──────────────────────────────────────────

export interface UseStudioSessionParams {
  userId?: string;
  sessionId?: string;
  newSession?: boolean;
  onboardingDemo?: boolean;
  autoSubmit?: boolean;
  focusJobId?: string;
  routeMode: StudioMode;
  templateId?: string;
  handoffId?: string;
  sourceImage?: string;
  sourceImageName?: string;
  searchVideoInputMode?: ConcreteVideoInputMode;
  searchPrompt?: string;
  models: AIModelPublic[];
  modelsLoading: boolean;
  videoGenerationEnabled: boolean;
  hasAdvancedAccess: boolean;
  embedded?: boolean;
  resultActionLabel?: string;
  onResultAction?: StudioResultAction;
}

export interface StudioSharedState {
  activeSessionId: string | null;
  sessionTitle: string;
  titleDraft: string;
  titleEditing: boolean;
  titleSaving: boolean;
  sessionLoading: boolean;
  messages: StudioMessage[];
  results: StudioResult[];
  selectedId: string | null;
  selectedJobId: string | null;
  submitting: boolean;
  optimisticJobs: GenerationJobPublic[];
  studioJobs: GenerationJobPublic[];
  studioJobsRefreshing: boolean;
  refreshStudioJobs: () => void;
  selected: StudioResult | null;
  selectedJob: GenerationJobPublic | null;
  selectedJobStatusPreview: GenerationJobPublic | null;
  pendingPreviewMessage: Extract<StudioMessage, { role: "assistant" }> | null;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  startTitleEdit: () => void;
  cancelTitleEdit: () => void;
  saveTitleEdit: () => Promise<void>;
  addResult: (items: StudioResult[]) => void;
  previewJob: (job: GenerationJobPublic) => void;
  resultsFromJob: (
    job: GenerationJobPublic,
    promptText: string,
    mode: StudioMode,
    messageId?: string,
  ) => StudioResult[];
  startNewSession: () => void;
  resetConversationDraft: (options?: { clearReferences?: boolean; promptText?: string }) => void;
  refreshStudioQueries: () => void;
  handleImageGenerate: (params: ImageGenerateParams) => Promise<void>;
  handleVideoGenerate: (params: VideoGenerateParams) => Promise<void>;
  waitForGenerationJob: (jobId: string) => Promise<GenerationJobPublic>;
  copyToClipboard: (value: string, successMessage: string) => Promise<void>;
  messageForResult: (
    result: StudioResult,
    sourceMessages?: StudioMessage[],
  ) => StudioMessage | undefined;
  resolveResultTarget: (result: StudioResult) => Promise<StudioEditTarget | null>;
  retryGenerationJob: (job: GenerationJobPublic) => void;
  ensureSession: (titleSeed: string, mode: StudioMode) => Promise<string | null>;
  loadSessionDetail: (id: string) => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  hasMoreMessages: boolean;
  appendMergedVideoToSession: (blob: Blob, sourceVideos: StudioResult[]) => Promise<void>;
  reuseUserMessageDraft: (
    message: Extract<StudioMessage, { role: "user" }>,
    refs: StudioReference[],
  ) => void;
  toggleStar: (resultId: string) => void;
  removeMedia: (resultId: string) => void;
}

export interface ImageGenerateParams {
  prompt: string;
  settings: StudioSettings;
  refs: StudioMediaReference[];
  videoGenerationEnabled: boolean;
  onClearInputs: () => void;
  onSubmitComplete?: (items: StudioResult[]) => void;
}

export interface VideoGenerateParams {
  selectedVideoMode: ConcreteVideoInputMode;
  videoDraftsRef: React.MutableRefObject<VideoModeDrafts>;
  updateVideoDraft: (
    mode: ConcreteVideoInputMode,
    updater: (draft: VideoModeDraft) => VideoModeDraft,
  ) => void;
  settings: StudioSettings;
  onClearInputs: () => void;
  onSubmitComplete?: (items: StudioResult[]) => void;
}

export function useStudioSession(params: UseStudioSessionParams): StudioSharedState {
  const {
    userId,
    sessionId,
    newSession: newSessionFromSearch,
    onboardingDemo = false,
    autoSubmit,
    focusJobId,
    routeMode,
    templateId,
    handoffId,
    sourceImage,
    sourceImageName,
    searchVideoInputMode,
    searchPrompt,
    models,
    modelsLoading,
    videoGenerationEnabled,
    hasAdvancedAccess,
    embedded = false,
    onResultAction,
  } = params;

  const { t, formatNumber } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nextMessageScrollBehaviorRef = useRef<ScrollBehavior>("auto");
  const hydratedSessionRef = useRef<string | null>(null);
  const loadingSessionDetailRef = useRef<string | null>(null);
  const failedSessionDetailRef = useRef<string | null>(null);
  const resolvingSessionRef = useRef(false);
  const creatingSessionRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleEditingRef = useRef(false);
  const titleSavingRef = useRef(false);
  const activeSessionIdRef = useRef<string | null>(sessionId ?? null);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(sessionId ?? null);
  const [sessionTitle, setSessionTitle] = useState(DEFAULT_CHAT_TITLE);
  const [titleDraft, setTitleDraft] = useState(t("studio.newChat"));
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleSaving, setTitleSaving] = useState(false);
  const [messages, setMessages] = useState<StudioMessage[]>([]);
  const [results, setResults] = useState<StudioResult[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(focusJobId ?? null);
  const [submittingSessionIds, setSubmittingSessionIds] = useState<Set<string>>(() => new Set());
  const [sessionlessSubmissionId, setSessionlessSubmissionId] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [optimisticJobs, setOptimisticJobs] = useState<GenerationJobPublic[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const loadingMoreRef = useRef(false);
  const scrollAnchorRef = useRef<{ top: number; height: number } | null>(null);

  const submitting = activeSessionId
    ? submittingSessionIds.has(activeSessionId)
    : Boolean(sessionlessSubmissionId);

  const selected = results.find((item) => item.id === selectedId) ?? results[0] ?? null;

  const pendingPreviewMessage = useMemo(
    () =>
      [...messages]
        .reverse()
        .find(
          (message): message is Extract<StudioMessage, { role: "assistant" }> =>
            message.role === "assistant" && message.status === "loading",
        ) ?? null,
    [messages],
  );

  const activeJobType = routeMode === "video" ? "IMAGE2VIDEO" : "TEXT2IMAGE";

  const studioJobsQ = useQuery({
    queryKey: ["dashboard", "jobs", "studio-strip", activeJobType],
    queryFn: () =>
      apiGet<GenerationJobPublic[]>("/api/generation/jobs", {
        query: { mine: true, limit: STUDIO_JOB_HISTORY_LIMIT, type: activeJobType },
      }),
    refetchInterval: 30000,
  });

  const studioJobs = useMemo(() => {
    const byId = new Map<string, GenerationJobPublic>();
    for (const job of optimisticJobs) {
      if (job.type === activeJobType) byId.set(job.id, job);
    }
    for (const job of studioJobsQ.data ?? []) {
      byId.set(job.id, job);
    }
    return [...byId.values()]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, STUDIO_JOB_HISTORY_LIMIT);
  }, [activeJobType, optimisticJobs, studioJobsQ.data]);

  const selectedJob = selectedJobId
    ? (studioJobs.find((job) => job.id === selectedJobId) ?? null)
    : null;

  const selectedJobStatusPreview =
    selectedJob && selectedJob.status !== "succeeded" && selected?.jobId !== selectedJob.id
      ? selectedJob
      : null;

  const refreshStudioQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["dashboard", "jobs"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard", "chats"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard", "ledger"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard", "notifications"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard", "media-center"] });
  }, [queryClient]);

  const refreshStudioJobs = useCallback(() => {
    void studioJobsQ.refetch();
    queryClient.invalidateQueries({ queryKey: ["dashboard", "jobs"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard", "chats"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard", "overview"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard", "ledger"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard", "notifications"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard", "media-center"] });
  }, [queryClient, studioJobsQ]);

  const markSessionSubmitting = (id: string) => {
    setSubmittingSessionIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const clearSessionSubmitting = (id: string | null | undefined) => {
    if (!id) return;
    setSubmittingSessionIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const addResult = (items: StudioResult[]) => {
    const newestFirst = [...items].reverse();
    setResults((prev) => [...newestFirst, ...prev].slice(0, 24));
    setSelectedJobId(null);
    setSelectedId(newestFirst[0]?.id ?? null);
  };

  const resultsFromJob = useCallback(
    (
      job: GenerationJobPublic,
      promptText: string,
      mode: StudioMode,
      messageId?: string,
    ): StudioResult[] => {
      const createdAt = new Date(job.finishedAt ?? job.createdAt).getTime();
      const params =
        job.params && typeof job.params === "object" && !Array.isArray(job.params)
          ? job.params
          : {};
      const fallbackUrls = [
        ...(Array.isArray(job.outputUrls) ? job.outputUrls : []),
        ...(Array.isArray(job.providerOutputUrls) ? job.providerOutputUrls : []),
        ...(Array.isArray(params.outputUrls) ? params.outputUrls : []),
        ...(Array.isArray(params.providerOutputUrls) ? params.providerOutputUrls : []),
        ...(Array.isArray(params.imageUrls) ? params.imageUrls : []),
        ...(Array.isArray(params.images) ? params.images : []),
      ].filter((url): url is string => typeof url === "string" && url.trim().length > 0);
      const items = studioResultsFromJob(job, promptText, mode, messageId ?? job.id);
      const fallbackItems = fallbackUrls
        .filter((url) => mode === "video" || mediaKindFromUrl(url) === "image")
        .map(
          (url, index): StudioResult => ({
            id: `${job.id}-fallback-${index}`,
            src: url,
            kind: mode,
            prompt: promptText,
            chatSessionId: job.chatSessionId ?? undefined,
            jobId: job.id,
            outputIndex: index,
          }),
        );
      const seen = new Set<string>();
      return [...items, ...fallbackItems]
        .filter((result) => {
          if (seen.has(result.src)) return false;
          seen.add(result.src);
          return true;
        })
        .map((result) => ({
          ...result,
          messageId,
          createdAt,
        }));
    },
    [],
  );

  const previewJob = useCallback(
    (job: GenerationJobPublic) => {
      setSelectedJobId(job.id);
      if (job.status !== "succeeded") {
        setSelectedId(null);
        return;
      }
      const mode = job.type === "IMAGE2VIDEO" ? "video" : "image";
      const items = resultsFromJob(job, job.prompt, mode);
      if (!items.length) return;
      setResults((prev) =>
        [...items, ...prev.filter((item) => item.jobId !== job.id)].slice(0, 24),
      );
      setSelectedId(items[0]?.id ?? null);
    },
    [resultsFromJob],
  );

  const copyToClipboard = useCallback(
    async (value: string, successMessage: string) => {
      try {
        await navigator.clipboard.writeText(value);
        toast.success(successMessage, { duration: 1400 });
      } catch {
        toast.error(t("studio.copyFailed"));
      }
    },
    [t],
  );

  const waitForGenerationJob = async (jobId: string) => {
    for (let attempt = 0; attempt < 150; attempt += 1) {
      const job = await apiGet<GenerationJobPublic>(`/api/generation/jobs/${jobId}`);
      if (job.status === "succeeded" || job.status === "failed" || job.status === "canceled") {
        return job;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error(t("studio.generationTimedOut"));
  };

  const messageForResult = (result: StudioResult, sourceMessages = messages) =>
    sourceMessages.find((message) => {
      if (message.role !== "assistant") return false;
      if (result.messageId && message.id === result.messageId) return true;
      return message.results.some((candidate) => studioResultsMatch(candidate, result));
    });

  const resolveResultTarget = async (result: StudioResult): Promise<StudioEditTarget | null> => {
    const localMessage = messageForResult(result);
    if (localMessage && activeSessionId) {
      const localResult = resultFromMessage(localMessage, result) ?? result;
      return {
        sessionId: activeSessionId,
        sessionTitle: displayChatTitle(sessionTitle, t),
        msgId: localMessage.id,
        result: {
          ...result,
          ...localResult,
          messageId: localMessage.id,
          chatSessionId: localResult.chatSessionId ?? result.chatSessionId ?? activeSessionId,
        },
      };
    }

    const sourceSessionId = result.chatSessionId ?? activeSessionId;
    if (!sourceSessionId) return null;

    try {
      const detail = await apiGet<ChatSessionDetail>(`/api/chats/${sourceSessionId}`);
      const restoredMessages = detail.messages
        .map(studioMessageFromRecord)
        .filter((msg): msg is StudioMessage => Boolean(msg));
      const sourceMessage = messageForResult(result, restoredMessages);
      if (!sourceMessage) return null;
      const sourceResult = resultFromMessage(sourceMessage, result) ?? result;
      return {
        sessionId: sourceSessionId,
        sessionTitle: displayChatTitle(detail.title, t),
        msgId: sourceMessage.id,
        result: {
          ...result,
          ...sourceResult,
          messageId: sourceMessage.id,
          chatSessionId: sourceResult.chatSessionId ?? sourceSessionId,
        },
      };
    } catch (err) {
      toast.error(t("studio.openConversationFailed"), {
        description: err instanceof Error ? err.message : undefined,
      });
      return null;
    }
  };

  const startTitleEdit = () => {
    if (sessionLoading || titleSaving) return;
    titleEditingRef.current = true;
    setTitleDraft(displayChatTitle(sessionTitle, t));
    setTitleEditing(true);
  };

  const cancelTitleEdit = () => {
    titleEditingRef.current = false;
    setTitleDraft(displayChatTitle(sessionTitle, t));
    setTitleEditing(false);
  };

  const saveTitleEdit = async () => {
    if (!titleEditingRef.current || titleSavingRef.current) return;
    const id = activeSessionIdRef.current;
    const nextTitle = persistedChatTitle(titleDraft) ?? DEFAULT_CHAT_TITLE;
    const nextDisplayTitle = displayChatTitle(nextTitle, t);
    if (!id) {
      titleEditingRef.current = false;
      setSessionTitle(nextTitle);
      setTitleDraft(nextDisplayTitle);
      setTitleEditing(false);
      return;
    }
    if (nextTitle === (persistedChatTitle(sessionTitle) ?? DEFAULT_CHAT_TITLE)) {
      titleEditingRef.current = false;
      setTitleDraft(displayChatTitle(sessionTitle, t));
      setTitleEditing(false);
      return;
    }
    titleSavingRef.current = true;
    setTitleSaving(true);
    try {
      const session = await apiPatch<ChatSession>(`/api/chats/${id}`, { title: nextTitle });
      if (activeSessionIdRef.current !== id) return;
      titleEditingRef.current = false;
      setSessionTitle(session.title);
      setTitleDraft(displayChatTitle(session.title, t));
      setTitleEditing(false);
      refreshStudioQueries();
      toast.success(t("studio.titleUpdated"), { duration: 1400 });
    } catch (err) {
      toast.error(t("studio.renameConversationFailed"), {
        description: err instanceof Error ? err.message : undefined,
      });
      window.requestAnimationFrame(() => titleInputRef.current?.focus());
    } finally {
      titleSavingRef.current = false;
      setTitleSaving(false);
    }
  };

  const toggleStar = (resultId: string) => {
    setResults((prev) => prev.map((r) => (r.id === resultId ? { ...r, starred: !r.starred } : r)));
    setMessages((prev) =>
      prev.map((m) =>
        m.role === "assistant"
          ? {
              ...m,
              results: m.results.map((r) =>
                r.id === resultId ? { ...r, starred: !r.starred } : r,
              ),
            }
          : m,
      ),
    );
  };

  const removeMedia = (resultId: string) => {
    setResults((prev) => prev.filter((r) => r.id !== resultId));
    setMessages((prev) =>
      prev.map((m) =>
        m.role === "assistant" ? { ...m, results: m.results.filter((r) => r.id !== resultId) } : m,
      ),
    );
    if (selectedId === resultId) {
      setSelectedJobId(null);
      setSelectedId(null);
    }
  };

  const reuseUserMessageDraft = (
    message: Extract<StudioMessage, { role: "user" }>,
    refs: StudioReference[],
  ) => {
    // This is called by panels which will handle the mode-specific state update.
    // We just provide it here so panels don't need to duplicate the toast.
    toast.success(t("studio.promptReused"));
  };

  // ── Session CRUD ──────────────────────────────────────────────────

  const loadSessionDetail = useCallback(
    async (id: string) => {
      if (loadingSessionDetailRef.current === id || failedSessionDetailRef.current === id) return;
      loadingSessionDetailRef.current = id;
      setSessionLoading(true);
      try {
        const detail = await apiGet<ChatSessionDetail & { hasMore?: boolean }>(
          `/api/chats/${id}?limit=10`,
        );
        if (activeSessionIdRef.current !== id) return;
        failedSessionDetailRef.current = null;
        const detailMode = detail.mode === "video" ? "video" : "image";
        if (!onboardingDemo && detailMode !== routeMode) {
          rememberLastStudioSessionId(null, userId, routeMode);
          rememberLastStudioSessionId(id, userId, detailMode);
          if (!embedded) {
            navigate({
              to: studioPathForMode(detailMode),
              search: { sessionId: id, jobId: focusJobId },
              replace: true,
            });
          }
          return;
        }
        const restored = detail.messages
          .map(studioMessageFromRecord)
          .filter((msg): msg is StudioMessage => Boolean(msg));
        const restoredResults = [...collectStudioResults(restored)].reverse();
        const focusedMessage = focusJobId
          ? [...restored]
              .reverse()
              .find(
                (msg): msg is Extract<StudioMessage, { role: "assistant" }> =>
                  msg.role === "assistant" && msg.generationJobId === focusJobId,
              )
          : null;
        const latestMessage = [...restored]
          .reverse()
          .find(
            (msg): msg is Extract<StudioMessage, { role: "assistant" }> =>
              msg.role === "assistant" && msg.status === "done",
          );
        const restoredSettings = (focusedMessage ?? latestMessage)?.settings;
        titleEditingRef.current = false;
        setSessionTitle(detail.title);
        setTitleDraft(displayChatTitle(detail.title, t));
        setTitleEditing(false);
        nextMessageScrollBehaviorRef.current = "auto";
        setMessages(restored);
        setResults(restoredResults);
        setSelectedJobId(focusJobId ?? null);
        setSelectedId(focusedMessage?.results[0]?.id ?? restoredResults[0]?.id ?? null);
        setHasMoreMessages(detail.messages.length >= 10);
        hydratedSessionRef.current = id;
      } catch (err) {
        if (activeSessionIdRef.current !== id) return;
        const status = apiErrorStatus(err);
        if (status === 403 || status === 404) {
          rememberLastStudioSessionId(null, userId, routeMode);
          hydratedSessionRef.current = id;
          activeSessionIdRef.current = null;
          setActiveSessionId(null);
          setMessages([]);
          setResults([]);
          setSelectedId(null);
          setSelectedJobId(null);
          setHasMoreMessages(false);
          if (!embedded) {
            navigate({
              to: studioPathForMode(routeMode),
              search: {
                templateId,
                handoffId,
                sourceImage,
                sourceImageName,
                prompt: searchPrompt,
                videoInputMode: searchVideoInputMode,
              },
              replace: true,
            });
          }
        } else {
          failedSessionDetailRef.current = id;
        }
        toast.error(t("studio.openConversationFailed"), {
          description: err instanceof Error ? err.message : undefined,
        });
      } finally {
        if (loadingSessionDetailRef.current === id) {
          loadingSessionDetailRef.current = null;
        }
        setSessionLoading(false);
      }
    },
    [
      embedded,
      focusJobId,
      handoffId,
      navigate,
      onboardingDemo,
      routeMode,
      searchPrompt,
      searchVideoInputMode,
      sourceImage,
      sourceImageName,
      t,
      templateId,
      userId,
    ],
  );

  const loadMoreMessages = useCallback(async () => {
    const id = activeSessionIdRef.current;
    if (!id || loadingMoreRef.current) return;
    const oldest = [...messages].sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!oldest) return;
    loadingMoreRef.current = true;
    try {
      const page = await apiGet<{ messages: ChatSessionDetail["messages"]; hasMore: boolean }>(
        `/api/chats/${id}/messages?before=${new Date(oldest.createdAt).toISOString()}&limit=10`,
      );
      if (activeSessionIdRef.current !== id) return;
      const restored = page.messages
        .map(studioMessageFromRecord)
        .filter((msg): msg is StudioMessage => Boolean(msg));
      // Save scroll anchor so useLayoutEffect can restore position
      const el = scrollRef.current;
      if (el) {
        scrollAnchorRef.current = { top: el.scrollTop, height: el.scrollHeight };
      }
      setMessages((prev) => [...restored, ...prev]);
      setResults((prev) => [...collectStudioResults(restored).reverse(), ...prev]);
      setHasMoreMessages(page.hasMore);
    } catch {
      // silently fail
    } finally {
      loadingMoreRef.current = false;
    }
  }, [messages]);

  const resetConversationDraft = useCallback(
    (options: { clearReferences?: boolean; promptText?: string } = {}) => {
      hydratedSessionRef.current = null;
      loadingSessionDetailRef.current = null;
      failedSessionDetailRef.current = null;
      activeSessionIdRef.current = null;
      titleEditingRef.current = false;
      setActiveSessionId(null);
      setSessionTitle(DEFAULT_CHAT_TITLE);
      setTitleDraft(displayChatTitle(DEFAULT_CHAT_TITLE, t));
      setTitleEditing(false);
      setSessionLoading(false);
      nextMessageScrollBehaviorRef.current = "auto";
      setMessages([]);
      setResults([]);
      setSelectedId(null);
      setSelectedJobId(null);
      setSessionlessSubmissionId(null);
      setHasMoreMessages(false);
    },
    [t],
  );

  const createNewSession = useCallback(
    async (
      titleSeed?: string,
      mode?: StudioMode,
      options: { preserveRouteContext?: boolean } = { preserveRouteContext: true },
    ) => {
      if (creatingSessionRef.current) return null;
      creatingSessionRef.current = true;
      setSessionLoading(true);
      try {
        const session = await apiPost<ChatSession>("/api/chats", {
          title: titleSeed ? titleFromPrompt(titleSeed) : undefined,
        });
        hydratedSessionRef.current = session.id;
        failedSessionDetailRef.current = null;
        activeSessionIdRef.current = session.id;
        setActiveSessionId(session.id);
        titleEditingRef.current = false;
        setSessionTitle(session.title);
        setTitleDraft(displayChatTitle(session.title, t));
        setTitleEditing(false);
        const sessionMode = mode ?? routeMode;
        if (sessionMode === "video") {
          await apiPost(`/api/chats/${session.id}/messages`, {
            role: "system",
            content: "Studio session mode",
            metadata: { settings: { mode: "video" } },
          });
        }
        if (!onboardingDemo) {
          rememberLastStudioSessionId(session.id, userId, sessionMode);
        }
        refreshStudioQueries();
        const preserveRouteContext = options.preserveRouteContext && sessionMode === routeMode;
        if (!embedded) {
          navigate({
            to: studioPathForMode(sessionMode),
            search: {
              sessionId: session.id,
              ...(preserveRouteContext
                ? {
                    templateId,
                    handoffId,
                    sourceImage,
                    sourceImageName,
                    prompt: sessionMode === routeMode ? searchPrompt : undefined,
                    videoInputMode: searchVideoInputMode,
                  }
                : {}),
            },
            replace: true,
          });
        }
        return session.id;
      } catch (err) {
        setSessionLoading(false);
        toast.error(t("studio.createConversationFailed"), {
          description: err instanceof Error ? err.message : undefined,
        });
        return null;
      } finally {
        creatingSessionRef.current = false;
      }
    },
    [
      embedded,
      handoffId,
      navigate,
      onboardingDemo,
      refreshStudioQueries,
      routeMode,
      searchPrompt,
      searchVideoInputMode,
      sourceImage,
      sourceImageName,
      t,
      templateId,
      userId,
    ],
  );

  const ensureSession = useCallback(
    async (titleSeed: string, mode: StudioMode) => {
      if (mode === "video") {
        return createNewSession(titleSeed, mode, { preserveRouteContext: false });
      }
      if (activeSessionId && mode === routeMode) return activeSessionId;
      return createNewSession(titleSeed, mode);
    },
    [activeSessionId, createNewSession, routeMode],
  );

  const startNewSession = useCallback(() => {
    resetConversationDraft();
    void createNewSession(undefined, undefined, { preserveRouteContext: false });
  }, [createNewSession, resetConversationDraft]);

  // ── Session restoration effect ────────────────────────────────────

  const resetConversationDraftRef = useRef(resetConversationDraft);
  resetConversationDraftRef.current = resetConversationDraft;

  useEffect(() => {
    const nextSessionId = sessionId ?? null;
    if (activeSessionIdRef.current !== nextSessionId) {
      failedSessionDetailRef.current = null;
    }
    activeSessionIdRef.current = nextSessionId;
    setActiveSessionId(nextSessionId);

    if (!nextSessionId) {
      hydratedSessionRef.current = null;
      if (newSessionFromSearch) {
        if (!creatingSessionRef.current) {
          resetConversationDraftRef.current({
            clearReferences: !(handoffId || sourceImage),
            promptText: searchPrompt ?? "",
          });
          void createNewSession(undefined, undefined, {
            preserveRouteContext: Boolean(handoffId || sourceImage),
          });
        }
        return;
      }

      if (onboardingDemo) {
        resetConversationDraftRef.current({
          clearReferences: !(handoffId || sourceImage),
          promptText: searchPrompt ?? "",
        });
        return;
      }

      if (resolvingSessionRef.current || creatingSessionRef.current) return;
      let cancelled = false;
      resolvingSessionRef.current = true;
      setSessionLoading(true);
      const restoreLastSession = async () => {
        try {
          const chats = await queryClient.fetchQuery({
            queryKey: ["dashboard", "chats"],
            queryFn: () => apiGet<ChatSession[]>("/api/chats"),
          });
          if (cancelled) return;
          const rememberedId = readLastStudioSessionId(userId, routeMode);
          const rememberedSession = rememberedId
            ? chats.find((chat) => chat.id === rememberedId)
            : null;

          if (rememberedSession && modeForChatSession(rememberedSession) === routeMode) {
            rememberLastStudioSessionId(rememberedSession.id, userId, routeMode);
            if (embedded) {
              activeSessionIdRef.current = rememberedSession.id;
              setActiveSessionId(rememberedSession.id);
              void loadSessionDetail(rememberedSession.id);
              return;
            }
            navigate({
              to: studioPathForMode(routeMode),
              search: {
                sessionId: rememberedSession.id,
                templateId,
                handoffId,
                sourceImage,
                sourceImageName,
              },
              replace: true,
            });
            return;
          }
          if (rememberedSession) {
            rememberLastStudioSessionId(null, userId, routeMode);
          }
          await createNewSession(undefined, routeMode);
        } catch {
          if (!cancelled) {
            await createNewSession(undefined, routeMode);
          }
        } finally {
          if (!cancelled) {
            setSessionLoading(false);
            resolvingSessionRef.current = false;
          }
        }
      };
      void restoreLastSession();
      return () => {
        cancelled = true;
        resolvingSessionRef.current = false;
      };
    }

    if (!onboardingDemo) {
      rememberLastStudioSessionId(nextSessionId, userId, routeMode);
    }
    if (hydratedSessionRef.current !== nextSessionId) {
      void loadSessionDetail(nextSessionId);
    }
  }, [
    sessionId,
    newSessionFromSearch,
    t,
    routeMode,
    focusJobId,
    handoffId,
    sourceImage,
    sourceImageName,
    templateId,
    embedded,
    navigate,
    queryClient,
    userId,
    loadSessionDetail,
    createNewSession,
    onboardingDemo,
  ]);

  useEffect(() => {
    if (onboardingDemo) return;
    if (activeSessionId) {
      rememberLastStudioSessionId(activeSessionId, userId, routeMode);
    }
  }, [activeSessionId, onboardingDemo, routeMode, userId]);

  // ── Scroll effect ─────────────────────────────────────────────────

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const anchor = scrollAnchorRef.current;
    if (anchor) {
      // Restore scroll position after prepending older messages.
      // The container grew taller by (el.scrollHeight - anchor.height).
      // Move scrollTop by that delta so visible content stays in place.
      const delta = el.scrollHeight - anchor.height;
      el.scrollTop = anchor.top + delta;
      scrollAnchorRef.current = null;
      return;
    }
    // Normal scroll-to-bottom for new messages or initial load.
    el.scrollTo({ top: el.scrollHeight, behavior: nextMessageScrollBehaviorRef.current });
    nextMessageScrollBehaviorRef.current = "smooth";
  }, [messages]);

  // ── Polling effect ────────────────────────────────────────────────

  useEffect(() => {
    const loadingMessages = messages.filter(
      (msg): msg is Extract<StudioMessage, { role: "assistant" }> & { generationJobId: string } =>
        msg.role === "assistant" &&
        msg.status === "loading" &&
        typeof msg.generationJobId === "string" &&
        msg.generationJobId.length > 0,
    );
    if (!activeSessionId || loadingMessages.length === 0) return;

    let cancelled = false;
    const sessionIdForPoll = activeSessionId;
    const tick = async () => {
      for (const message of loadingMessages) {
        try {
          const job = await apiGet<GenerationJobPublic>(
            `/api/generation/jobs/${message.generationJobId}`,
          );
          if (
            cancelled ||
            activeSessionIdRef.current !== sessionIdForPoll ||
            (job.chatSessionId && job.chatSessionId !== sessionIdForPoll) ||
            job.status === "queued" ||
            job.status === "running"
          ) {
            continue;
          }

          if (job.status === "succeeded") {
            const items = resultsFromJob(job, message.text, message.settings.mode, message.id);
            const newestFirst = [...items].reverse();
            setOptimisticJobs((prev) =>
              [job, ...prev.filter((item) => item.id !== job.id)].slice(0, 24),
            );
            setMessages((prev) =>
              prev.map((item) =>
                item.role === "assistant" && item.generationJobId === job.id
                  ? { ...item, status: "done", results: items, error: undefined }
                  : item,
              ),
            );
            setResults((prev) =>
              [...newestFirst, ...prev.filter((item) => item.jobId !== job.id)].slice(0, 24),
            );
            setSelectedJobId(null);
            setSelectedId(newestFirst[0]?.id ?? null);
            refreshStudioQueries();
          } else {
            const notice = studioGenerationErrorNotice({
              rawMessage: job.errorMessage,
              t,
            });
            const errorValue = notice.message;
            setOptimisticJobs((prev) =>
              [job, ...prev.filter((item) => item.id !== job.id)].slice(0, 24),
            );
            setMessages((prev) =>
              prev.map((item) =>
                item.role === "assistant" && item.generationJobId === job.id
                  ? { ...item, status: "error", error: errorValue }
                  : item,
              ),
            );
            refreshStudioQueries();
          }
        } catch {
          // Keep the local loading state and try again on the next tick.
        }
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeSessionId, hasAdvancedAccess, messages, resultsFromJob, refreshStudioQueries, t]);

  // ── Title editing effects ─────────────────────────────────────────

  useEffect(() => {
    if (!titleEditing) {
      setTitleDraft(displayChatTitle(sessionTitle, t));
    }
  }, [sessionTitle, t, titleEditing]);

  useEffect(() => {
    titleEditingRef.current = titleEditing;
    if (!titleEditing) return;
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        titleInputRef.current?.focus();
        titleInputRef.current?.select();
      });
    }
  }, [titleEditing]);

  // ── handleImageGenerate ───────────────────────────────────────────

  const handleImageGenerate = useCallback(
    async (genParams: ImageGenerateParams) => {
      const {
        prompt: genPrompt,
        settings: genInputSettings,
        refs: genInputRefs,
        onClearInputs,
        onSubmitComplete,
      } = genParams;
      const effectiveSettings = defaultStudioSettings({
        ...genInputSettings,
        mode: "image",
        videoInputMode: null,
      });
      let text = genPrompt.trim();

      if (!text) {
        toast.error(t("studio.inputRequired"));
        return;
      }

      const candidateModels = models.filter((model) => model.category === "TEXT2IMAGE");
      const modelObj =
        candidateModels.find((model) => model.code === effectiveSettings.model) ??
        candidateModels.find((model) => model.isDefault) ??
        candidateModels[0];

      if (!modelObj) {
        toast.error(t("studio.noImageModel"));
        return;
      }
      if (modelObj.accessLevel === "PAID" && !hasAdvancedAccess) {
        toast.error(t("studio.advancedAccessRequired"), {
          description: t("studio.advancedAccessRequiredDesc"),
        });
        return;
      }

      const generationSettings = { ...effectiveSettings, model: modelObj.code };

      const draftToRestore = {
        prompt: text,
        refs: [...genInputRefs],
        settings: { ...generationSettings },
      };

      const submissionId = newStudioId();
      const originSessionId = activeSessionIdRef.current;
      let sessionIdForMessage: string | null = null;
      let submittingSessionId: string | null = originSessionId;

      const messageSessionStillCurrent = () =>
        Boolean(sessionIdForMessage && activeSessionIdRef.current === sessionIdForMessage);

      const clearSubmissionState = () => {
        clearSessionSubmitting(submittingSessionId);
        setSessionlessSubmissionId((prev) => (prev === submissionId ? null : prev));
      };

      void originSessionId; // may be used below

      if (originSessionId) {
        markSessionSubmitting(originSessionId);
      } else {
        setSessionlessSubmissionId(submissionId);
      }

      let effectiveRefs: StudioMediaReference[];
      try {
        effectiveRefs = await Promise.all(
          genInputRefs.map(async (ref) => {
            if (!/^data:image\//i.test(ref.src)) return ref;
            const blob = await blobFromDataUrl(ref.src);
            return { ...ref, src: await referenceSrcFromBlob(blob, ref.name, "image") };
          }),
        );
      } catch (err) {
        clearSubmissionState();
        toast.error(t("studio.referenceFileReadFailed"), {
          description: err instanceof Error ? err.message : undefined,
        });
        return;
      }

      const modelReferenceBounds = referenceBoundsForModel("image", modelObj);

      if (
        modelReferenceBounds.requiresReferenceImages &&
        effectiveRefs.length < modelReferenceBounds.minReferenceImages
      ) {
        clearSubmissionState();
        toast.error(t("studio.referenceImageRequired"));
        return;
      }
      if (!modelReferenceBounds.supportsReferenceImages && effectiveRefs.length > 0) {
        clearSubmissionState();
        toast.error(t("studio.modelNoReferenceImages"));
        return;
      }
      if (effectiveRefs.length > modelReferenceBounds.maxReferenceImages) {
        clearSubmissionState();
        toast.error(
          t("studio.referenceImageTooMany", { count: modelReferenceBounds.maxReferenceImages }),
        );
        return;
      }

      try {
        const ensuredSessionId = await ensureSession(draftToRestore.prompt, "image");
        if (!ensuredSessionId) {
          clearSubmissionState();
          return;
        }
        sessionIdForMessage = ensuredSessionId;
        submittingSessionId = ensuredSessionId;
        if (!originSessionId) {
          setSessionlessSubmissionId((prev) => (prev === submissionId ? null : prev));
          markSessionSubmitting(ensuredSessionId);
        }
      } catch (err) {
        clearSubmissionState();
        toast.error(t("studio.createConversationFailed"), {
          description: err instanceof Error ? err.message : undefined,
        });
        return;
      }

      const userMessage: StudioMessage = {
        id: newStudioId(),
        role: "user",
        text,
        settings: generationSettings,
        metadata: { refs: [...effectiveRefs] },
        createdAt: Date.now(),
      };
      const assistantId = newStudioId();
      const assistantMessage: StudioMessage = {
        id: assistantId,
        role: "assistant",
        text,
        status: "loading",
        settings: generationSettings,
        results: [],
        createdAt: Date.now(),
      };

      if (messageSessionStillCurrent()) {
        setMessages((prev) => [...prev, userMessage, assistantMessage]);
      }

      let generationJobId: string | undefined;
      let assistantMessageId = assistantId;
      try {
        await apiPost(`/api/chats/${sessionIdForMessage}/messages`, {
          role: "user",
          content: text,
          metadata: {
            settings: generationSettings,
            refs: [...effectiveRefs],
            clientMessageId: userMessage.id,
          },
        });

        const finalPrompt = buildFinalPrompt({
          prompt: text,
          style: generationSettings.style,
          negative: generationSettings.negative,
          seed: generationSettings.seed,
        });
        const referenceImages = effectiveRefs.map((ref) => ref.src);
        const referenceMediaIds = effectiveRefs.map((ref) => ref.mediaId?.trim() ?? "");
        const hasReferenceMediaIds = referenceMediaIds.some(Boolean);

        const job = await apiPost<GenerationJobPublic>("/api/generation/jobs", {
          type: "TEXT2IMAGE",
          modelCode: modelObj.code,
          prompt: finalPrompt,
          chatSessionId: sessionIdForMessage,
          params: {
            n: Math.min(Math.max(generationSettings.count, 1), 4),
            size: ratioToSize(generationSettings.ratio),
            ratio: generationSettings.ratio,
            ...(effectiveRefs.length
              ? {
                  reference_images: referenceImages,
                  ...(hasReferenceMediaIds ? { reference_media_ids: referenceMediaIds } : {}),
                }
              : {}),
          },
        });
        generationJobId = job.id;
        setOptimisticJobs((prev) =>
          [job, ...prev.filter((item) => item.id !== job.id)].slice(0, 24),
        );
        if (messageSessionStillCurrent()) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId && msg.role === "assistant"
                ? { ...msg, generationJobId }
                : msg,
            ),
          );
        }
        const savedAssistantMessage = await apiPost<ChatSessionDetail["messages"][number]>(
          `/api/chats/${sessionIdForMessage}/messages`,
          {
            role: "assistant",
            content: text,
            generationJobId,
            metadata: {
              status: "loading",
              settings: generationSettings,
              clientMessageId: assistantId,
            },
          },
        );
        assistantMessageId = savedAssistantMessage.id;
        if (messageSessionStillCurrent()) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId && msg.role === "assistant"
                ? { ...msg, id: assistantMessageId, generationJobId }
                : msg,
            ),
          );
        }

        clearSubmissionState();
        if (messageSessionStillCurrent()) {
          onClearInputs();
        }
        refreshStudioQueries();
        if (onSubmitComplete) {
          try {
            const detail = await apiGet<ChatSessionDetail>(`/api/chats/${sessionIdForMessage}`);
            const assistantRecord = [...detail.messages]
              .reverse()
              .find((r) => r.generationJobId === job.id);
            const restoredMsg = assistantRecord ? studioMessageFromRecord(assistantRecord) : null;
            if (restoredMsg?.role === "assistant") {
              onSubmitComplete(restoredMsg.results);
            }
          } catch {
            /* embedded mode best-effort */
          }
        }
      } catch (err) {
        const rawMessage = err instanceof Error ? err.message : undefined;
        const notice = studioGenerationErrorNotice({
          rawMessage,
          t,
        });
        const errorValue = notice.message;

        if (messageSessionStillCurrent()) {
          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantMessageId && item.role === "assistant"
                ? { ...item, status: "error", error: errorValue }
                : item,
            ),
          );
        }
        if (!generationJobId) {
          void apiPost(`/api/chats/${sessionIdForMessage}/messages`, {
            role: "assistant",
            content: text,
            metadata: {
              status: "error",
              error: errorValue,
              settings: generationSettings,
              clientMessageId: assistantId,
            },
          })
            .then(refreshStudioQueries)
            .catch(() => undefined);
        } else {
          refreshStudioQueries();
        }
        if (messageSessionStillCurrent()) {
          if (draftToRestore.refs.length) {
            // restore refs on error
          }
        }
        toast.error(notice.title, { description: notice.description });
      } finally {
        clearSubmissionState();
      }
    },
    [ensureSession, hasAdvancedAccess, models, refreshStudioQueries, t],
  );

  // ── handleVideoGenerate ───────────────────────────────────────────

  const handleVideoGenerate = useCallback(
    async (genParams: VideoGenerateParams) => {
      const {
        selectedVideoMode,
        videoDraftsRef,
        updateVideoDraft,
        settings: genInputSettings,
        onClearInputs,
        onSubmitComplete,
      } = genParams;

      const videoDraft = videoDraftsRef.current[selectedVideoMode];
      const effectiveSettings = defaultStudioSettings({
        ...genInputSettings,
        mode: "video",
        style: "none",
        videoInputMode: normalizeVideoMode(genInputSettings.videoInputMode ?? selectedVideoMode),
      });
      const payloadVideoMode = normalizeVideoMode(
        effectiveSettings.videoInputMode,
      ) as ConcreteVideoInputMode;

      const text =
        genInputSettings.mode === "video" ? videoDraftsRef.current[payloadVideoMode].prompt : "";
      const rawRefs = withVideoReferenceTypes(
        videoDraftsRef.current[payloadVideoMode].refs,
        effectiveSettings.videoInputMode,
      );

      if (!text.trim()) {
        toast.error(t("studio.inputRequired"));
        return;
      }
      if (!videoGenerationEnabled) {
        toast.error(t("studio.videoUnavailable"));
        return;
      }
      if (submitting) return;

      const candidateModels = models.filter(
        (model) =>
          model.category === "IMAGE2VIDEO" &&
          (!model.videoInputMode ||
            normalizeVideoMode(model.videoInputMode) ===
              normalizeVideoMode(effectiveSettings.videoInputMode)),
      );
      const modelObj =
        candidateModels.find((model) => model.code === effectiveSettings.model) ??
        candidateModels.find((model) => model.isDefault) ??
        candidateModels[0];
      if (!modelObj) {
        toast.error(t("studio.noVideoModel"));
        return;
      }

      const generationSettings = { ...effectiveSettings, model: modelObj.code };
      const draftToRestore = {
        prompt: text,
        refs: [...rawRefs],
        settings: { ...generationSettings },
        videoMode: payloadVideoMode,
      };

      const submissionId = newStudioId();
      const originSessionId = activeSessionIdRef.current;
      let sessionIdForMessage: string | null = null;
      let submittingSessionId: string | null = originSessionId;

      const messageSessionStillCurrent = () =>
        Boolean(sessionIdForMessage && activeSessionIdRef.current === sessionIdForMessage);

      const clearSubmissionState = () => {
        clearSessionSubmitting(submittingSessionId);
        setSessionlessSubmissionId((prev) => (prev === submissionId ? null : prev));
      };

      if (originSessionId) {
        markSessionSubmitting(originSessionId);
      } else {
        setSessionlessSubmissionId(submissionId);
      }

      let effectiveRefs: StudioMediaReference[];
      try {
        effectiveRefs = await Promise.all(
          rawRefs.map(async (ref) => {
            if (!/^data:image\//i.test(ref.src)) return ref;
            const blob = await blobFromDataUrl(ref.src);
            return { ...ref, src: await referenceSrcFromBlob(blob, ref.name, "image") };
          }),
        );
      } catch (err) {
        clearSubmissionState();
        toast.error(t("studio.referenceFileReadFailed"), {
          description: err instanceof Error ? err.message : undefined,
        });
        return;
      }

      // Video reference validation
      {
        const videoMode = normalizeVideoMode(generationSettings.videoInputMode);
        const mediaRefs = withVideoReferenceTypes(effectiveRefs, videoMode);
        const imageRefs = mediaRefs.filter(
          (ref) => (ref.kind ?? mediaKindFromUrl(ref.src)) === "image",
        );
        const videoRefs = mediaRefs.filter(
          (ref) => (ref.kind ?? mediaKindFromUrl(ref.src)) === "video",
        );
        if (videoMode === "I2V" && imageRefs.length < 1) {
          clearSubmissionState();
          toast.error(t("studio.videoReferenceRequired"));
          return;
        }
        if (videoMode === "R2V" && mediaRefs.length < 1) {
          clearSubmissionState();
          toast.error(t("studio.videoReferenceRequired"));
          return;
        }
        if (videoMode === "EDIT" && videoRefs.length < 1) {
          clearSubmissionState();
          toast.error(t("studio.videoEditVideoRequired"));
          return;
        }
        if (videoMode === "I2V" && imageRefs.length > 1) {
          clearSubmissionState();
          toast.error(t("studio.videoReferenceLimit", { count: 1 }));
          return;
        }
        if (
          (videoMode === "R2V" || videoMode === "EDIT") &&
          mediaRefs.length > MAX_STUDIO_REFERENCE_MEDIA
        ) {
          clearSubmissionState();
          toast.error(t("studio.videoReferenceLimit", { count: MAX_STUDIO_REFERENCE_MEDIA }));
          return;
        }
        if (
          videoMode === "R2V" &&
          videoRefs.length > 0 &&
          (generationSettings.duration < VIDEO_REFERENCE_VIDEO_GENERATION_MIN_SECONDS ||
            generationSettings.duration > VIDEO_REFERENCE_VIDEO_GENERATION_MAX_SECONDS)
        ) {
          generationSettings.duration = Math.min(
            VIDEO_REFERENCE_VIDEO_GENERATION_MAX_SECONDS,
            Math.max(VIDEO_REFERENCE_VIDEO_GENERATION_MIN_SECONDS, generationSettings.duration),
          );
        }
        effectiveRefs = mediaRefs;
      }

      try {
        const ensuredSessionId = await ensureSession(draftToRestore.prompt, "video");
        if (!ensuredSessionId) {
          clearSubmissionState();
          return;
        }
        sessionIdForMessage = ensuredSessionId;
        submittingSessionId = ensuredSessionId;
        if (!originSessionId) {
          setSessionlessSubmissionId((prev) => (prev === submissionId ? null : prev));
          markSessionSubmitting(ensuredSessionId);
        }
      } catch (err) {
        clearSubmissionState();
        toast.error(t("studio.createConversationFailed"), {
          description: err instanceof Error ? err.message : undefined,
        });
        return;
      }

      const userMessage: StudioMessage = {
        id: newStudioId(),
        role: "user",
        text,
        settings: generationSettings,
        metadata: { refs: [...effectiveRefs] },
        createdAt: Date.now(),
      };
      const assistantId = newStudioId();
      const assistantMessage: StudioMessage = {
        id: assistantId,
        role: "assistant",
        text,
        status: "loading",
        settings: generationSettings,
        results: [],
        createdAt: Date.now(),
      };

      if (messageSessionStillCurrent()) {
        setMessages((prev) => [...prev, userMessage, assistantMessage]);
      }

      let generationJobId: string | undefined;
      let assistantMessageId = assistantId;
      try {
        await apiPost(`/api/chats/${sessionIdForMessage}/messages`, {
          role: "user",
          content: text,
          metadata: {
            settings: generationSettings,
            refs: [...effectiveRefs],
            clientMessageId: userMessage.id,
          },
        });

        const finalPrompt = buildFinalPrompt({
          prompt: text,
          style: generationSettings.style,
          negative: generationSettings.negative,
          seed: generationSettings.seed,
        });
        const job = await apiPost<GenerationJobPublic>("/api/generation/jobs", {
          type: "IMAGE2VIDEO",
          modelCode: modelObj.code,
          prompt: finalPrompt,
          chatSessionId: sessionIdForMessage,
          params: {
            ratio: generationSettings.ratio,
            aspect_ratio: generationSettings.ratio,
            duration: clampStudioVideoDuration(generationSettings.duration),
            resolution: generationSettings.resolution,
            videoInputMode: generationSettings.videoInputMode,
            imageUrls: effectiveRefs
              .filter((ref) => (ref.kind ?? mediaKindFromUrl(ref.src)) === "image")
              .map((ref) => ref.src),
            videoUrls: effectiveRefs
              .filter((ref) => (ref.kind ?? mediaKindFromUrl(ref.src)) === "video")
              .map((ref) => ref.src),
            media: withVideoReferenceTypes(effectiveRefs, generationSettings.videoInputMode).map(
              (ref) => ({
                type: ref.mediaType,
                url: ref.src,
              }),
            ),
            prompt_extend: false,
            watermark: false,
          },
        });
        generationJobId = job.id;
        setOptimisticJobs((prev) =>
          [job, ...prev.filter((item) => item.id !== job.id)].slice(0, 24),
        );
        if (messageSessionStillCurrent()) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId && msg.role === "assistant"
                ? { ...msg, generationJobId }
                : msg,
            ),
          );
        }
        const savedAssistantMessage = await apiPost<ChatSessionDetail["messages"][number]>(
          `/api/chats/${sessionIdForMessage}/messages`,
          {
            role: "assistant",
            content: text,
            generationJobId,
            metadata: {
              status: "loading",
              settings: generationSettings,
              clientMessageId: assistantId,
            },
          },
        );
        assistantMessageId = savedAssistantMessage.id;
        if (messageSessionStillCurrent()) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId && msg.role === "assistant"
                ? { ...msg, id: assistantMessageId, generationJobId }
                : msg,
            ),
          );
        }

        const completed = await waitForGenerationJob(job.id);
        if (completed.status !== "succeeded") {
          throw new Error(completed.errorMessage ?? "");
        }

        const items = resultsFromJob(completed, text, generationSettings.mode, assistantMessageId);

        if (messageSessionStillCurrent()) {
          onClearInputs();
        }

        if (messageSessionStillCurrent()) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId && msg.role === "assistant"
                ? { ...msg, status: "done", results: items }
                : msg,
            ),
          );
        }
        refreshStudioQueries();

        if (messageSessionStillCurrent()) {
          if (!items.length) {
            toast.error(t("studio.noPreviewAssets"));
          } else {
            addResult(items);
          }
        }
        if (embedded && onResultAction && items.length) {
          try {
            const detail = await apiGet<ChatSessionDetail>(`/api/chats/${sessionIdForMessage}`);
            const assistantRecord = [...detail.messages]
              .reverse()
              .find((r) => r.generationJobId === job.id);
            const restoredMsg = assistantRecord ? studioMessageFromRecord(assistantRecord) : null;
            const newest =
              restoredMsg?.role === "assistant"
                ? [...restoredMsg.results].reverse()[0]
                : [...items].reverse()[0];
            if (assistantRecord && newest) {
              void onResultAction({
                sessionId: sessionIdForMessage,
                sessionTitle: displayChatTitle(detail.title, t),
                messageId: assistantRecord.id,
                result: newest,
              });
            }
          } catch (err) {
            toast.error(t("studio.editor.autoImportFailed"), {
              description: err instanceof Error ? err.message : undefined,
            });
          }
        }
      } catch (err) {
        const rawMessage = err instanceof Error ? err.message : undefined;
        const notice = studioGenerationErrorNotice({
          rawMessage,
          t,
        });
        const errorValue = notice.message;

        if (messageSessionStillCurrent()) {
          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantMessageId && item.role === "assistant"
                ? { ...item, status: "error", error: errorValue }
                : item,
            ),
          );
        }
        if (!generationJobId) {
          void apiPost(`/api/chats/${sessionIdForMessage}/messages`, {
            role: "assistant",
            content: text,
            metadata: {
              status: "error",
              error: errorValue,
              settings: generationSettings,
              clientMessageId: assistantId,
            },
          })
            .then(refreshStudioQueries)
            .catch(() => undefined);
        } else {
          refreshStudioQueries();
        }
        if (messageSessionStillCurrent()) {
          updateVideoDraft(draftToRestore.videoMode, (draft) => ({
            ...draft,
            prompt: draft.prompt.trim() ? draft.prompt : draftToRestore.prompt,
            refs: draft.refs.length ? draft.refs : draftToRestore.refs,
            settings: draftToRestore.settings,
          }));
        }
        toast.error(notice.title, { description: notice.description });
      } finally {
        clearSubmissionState();
      }
    },
    [
      addResult,
      ensureSession,
      hasAdvancedAccess,
      models,
      onResultAction,
      refreshStudioQueries,
      resultsFromJob,
      submitting,
      t,
      videoGenerationEnabled,
      waitForGenerationJob,
      embedded,
    ],
  );

  const retryGenerationJob = useCallback((_job: GenerationJobPublic) => {
    // Retry handled at the panel level - not implemented generically
  }, []);

  const appendMergedVideoToSession = useCallback(
    async (_blob: Blob, _sourceVideos: StudioResult[]) => {
      // Video merge handled at the panel level
    },
    [],
  );

  return {
    activeSessionId,
    sessionTitle: displayChatTitle(sessionTitle, t),
    titleDraft,
    titleEditing,
    titleSaving,
    sessionLoading,
    messages,
    results,
    selectedId,
    selectedJobId,
    submitting,
    optimisticJobs,
    studioJobs,
    studioJobsRefreshing: studioJobsQ.isFetching,
    refreshStudioJobs,
    selected,
    selectedJob,
    selectedJobStatusPreview,
    pendingPreviewMessage,
    scrollRef,
    startTitleEdit,
    cancelTitleEdit,
    saveTitleEdit,
    addResult,
    previewJob,
    resultsFromJob,
    startNewSession,
    resetConversationDraft,
    refreshStudioQueries,
    handleImageGenerate,
    handleVideoGenerate,
    waitForGenerationJob,
    copyToClipboard,
    messageForResult,
    resolveResultTarget,
    retryGenerationJob,
    ensureSession,
    loadSessionDetail,
    loadMoreMessages: loadMoreMessages as () => Promise<void>,
    hasMoreMessages,
    appendMergedVideoToSession,
    reuseUserMessageDraft,
    toggleStar,
    removeMedia,
  };
}
