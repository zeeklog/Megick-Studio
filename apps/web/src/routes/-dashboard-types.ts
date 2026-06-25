import type {
  GenerationJobPublic,
  GenerationJobType,
  VideoModelInputMode,
} from "@megick/api-types";
import { DEFAULT_CHAT_TITLE } from "@/lib/chat-title";

export interface DashboardOverview {
  credits: number;
  totalGenerations: number;
  successRate: number;
  totalSpent?: number;
  hasAdvancedAccess?: boolean;
}

export interface CreditLedgerEntry {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  pinned: boolean;
  updatedAt: string;
  createdAt: string;
  mode?: StudioMode;
  jobs?: Array<{
    id: string;
    type: GenerationJobType;
    createdAt?: string;
  }>;
  _count?: {
    messages: number;
    jobs: number;
  };
}

export interface ChatSessionDetail extends ChatSession {
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    metadata?: Record<string, unknown> | null;
    createdAt: string;
    generationJob?: GenerationJobPublic | null;
    generationJobId?: string | null;
  }>;
}

export type DashboardTab =
  | "studio"
  | "templates"
  | "overview"
  | "history"
  | "chats"
  | "profile";

export type StudioMode = "image" | "video";

const lastStudioSessionStorageKey = (userId?: string | null, mode?: StudioMode | null) =>
  mode
    ? `megick-last-studio-session:${mode}${userId ? `:${userId}` : ""}`
    : `megick-last-studio-session${userId ? `:${userId}` : ""}`;

export function readLastStudioSessionId(userId?: string | null, mode?: StudioMode | null) {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(lastStudioSessionStorageKey(userId, mode));
  } catch {
    return null;
  }
}

export function rememberLastStudioSessionId(
  sessionId: string | null | undefined,
  userId?: string | null,
  mode?: StudioMode | null,
) {
  if (typeof window === "undefined") return;
  try {
    const key = lastStudioSessionStorageKey(userId, mode);
    if (sessionId) {
      window.localStorage.setItem(key, sessionId);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // localStorage may be unavailable in private browsing.
  }
}

export function mostRecentChatSession(chats: readonly ChatSession[]) {
  return (
    [...chats].sort((a, b) => {
      const aTime = new Date(a.updatedAt).getTime();
      const bTime = new Date(b.updatedAt).getTime();
      return bTime - aTime;
    })[0] ?? null
  );
}

export const studioPathForMode = (mode: StudioMode) =>
  mode === "video" ? "/dashboard/studio/video" : "/dashboard/studio/image";

export const studioPathForJob = (job: Pick<GenerationJobPublic, "type">) =>
  studioPathForMode(job.type === "IMAGE2VIDEO" ? "video" : "image");

export const studioSearchForJob = (
  job: Pick<GenerationJobPublic, "id" | "chatSessionId">,
) => (job.chatSessionId ? { sessionId: job.chatSessionId, jobId: job.id } : undefined);

export function modeForChatSession(chat: Pick<ChatSession, "jobs" | "mode">): StudioMode {
  const explicitMode = chat.mode;
  if (explicitMode === "video" || explicitMode === "image") return explicitMode;
  return chat.jobs?.some((job) => job.type === "IMAGE2VIDEO") ? "video" : "image";
}

export const studioPathForChatSession = (chat: Pick<ChatSession, "jobs" | "mode">) =>
  studioPathForMode(modeForChatSession(chat));

export type StudioSettings = {
  mode: StudioMode;
  style: string;
  ratio: string;
  resolution: "720P" | "1080P";
  duration: number;
  count: number;
  seed: number | null;
  negative: string;
  model: string;
  videoInputMode?: VideoModelInputMode | null;
};

export type StudioResult = {
  id: string;
  src: string;
  thumbnailSrc?: string;
  fallbackSrc?: string;
  sourceSrc?: string;
  mediaId?: string;
  kind: StudioMode;
  prompt: string;
  messageId?: string;
  chatSessionId?: string;
  jobId?: string;
  outputIndex?: number;
  starred?: boolean;
  createdAt?: number;
};

export type StudioMessage =
  | {
    id: string;
    role: "user";
    text: string;
    settings: StudioSettings;
    metadata?: Record<string, unknown> | null;
    createdAt: number;
  }
  | {
    id: string;
    role: "assistant";
    text: string;
    status: "loading" | "done" | "error";
    results: StudioResult[];
    settings: StudioSettings;
    generationJobId?: string;
    error?: string;
    createdAt: number;
  };

export const VIDEO_DURATION_MIN_SECONDS = 2;
export const VIDEO_DURATION_MAX_SECONDS = 15;
export const VIDEO_DURATION_DEFAULT_SECONDS = 5;

export function clampStudioVideoDuration(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return VIDEO_DURATION_DEFAULT_SECONDS;
  return Math.min(
    VIDEO_DURATION_MAX_SECONDS,
    Math.max(VIDEO_DURATION_MIN_SECONDS, Math.round(numeric)),
  );
}

export const defaultStudioSettings = (override?: Partial<StudioSettings>): StudioSettings => ({
  mode: "image",
  style: "none",
  ratio: "1:1",
  resolution: "720P",
  count: 1,
  seed: null,
  negative: "",
  model: override?.model || "",
  videoInputMode: null,
  ...override,
  duration: clampStudioVideoDuration(override?.duration),
});

export const newStudioId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const titleFromPrompt = (text: string) => {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 32 ? `${compact.slice(0, 32)}...` : compact || DEFAULT_CHAT_TITLE;
};

export const metadataSettings = (
  metadata: Record<string, unknown> | null | undefined,
): StudioSettings => {
  const source = metadata?.settings;
  return source && typeof source === "object"
    ? defaultStudioSettings(source as Partial<StudioSettings>)
    : defaultStudioSettings();
};

export const metadataResultUrls = (
  metadata: Record<string, unknown> | null | undefined,
): string[] => {
  const raw = metadata?.results;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const candidate =
          (item as { src?: unknown; url?: unknown }).src ?? (item as { url?: unknown }).url;
        return typeof candidate === "string" ? candidate : "";
      }
      return "";
    })
    .filter(Boolean);
};

const metadataResultCreatedAt = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
};

const directAssetSrc = (src: string) => {
  const raw = src.trim();
  if (!raw || raw.startsWith("data:")) return raw;

  const readUrl = (url: URL, absolute: boolean) => {
    if (url.pathname !== "/api/oss/assets/content") return null;
    const key = url.searchParams.get("key");
    if (!key) return null;
    const signedPath = `/api/oss/sign?key=${encodeURIComponent(key)}`;
    return absolute ? `${url.origin}${signedPath}` : signedPath;
  };

  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      return readUrl(url, true) ?? raw;
    }
    if (raw.startsWith("/")) {
      return readUrl(new URL(raw, "http://local"), false) ?? raw;
    }
  } catch {
    return raw;
  }

  return raw;
};

const withDirectAssetSrc = (src: string, fallbackSrc?: string, sourceSrc?: string | null) => {
  const direct = directAssetSrc(src);
  const directFallback = fallbackSrc ? directAssetSrc(fallbackSrc) : undefined;
  const directSource = sourceSrc ? directAssetSrc(sourceSrc) : undefined;
  return {
    src: direct,
    fallbackSrc:
      directFallback && directFallback !== direct
        ? directFallback
        : direct !== src
          ? src
          : undefined,
    sourceSrc: directSource && directSource !== direct ? directSource : undefined,
  };
};

export const metadataResults = (
  metadata: Record<string, unknown> | null | undefined,
  prompt: string,
  fallbackKind: StudioMode,
  idPrefix: string,
): StudioResult[] => {
  const raw = metadata?.results;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index): StudioResult | null => {
      if (typeof item === "string") {
        const media = withDirectAssetSrc(item);
        return {
          id: `${idPrefix}-metadata-${index}`,
          src: media.src,
          fallbackSrc: media.fallbackSrc,
          kind: fallbackKind,
          prompt,
        };
      }
      if (!item || typeof item !== "object") return null;
      const record = item as {
        id?: unknown;
        assetId?: unknown;
        src?: unknown;
        url?: unknown;
        thumbnailSrc?: unknown;
        thumbnailUrl?: unknown;
        fallbackSrc?: unknown;
        fallbackUrl?: unknown;
        sourceUrl?: unknown;
        sourceSrc?: unknown;
        mediaId?: unknown;
        kind?: unknown;
        prompt?: unknown;
        messageId?: unknown;
        chatSessionId?: unknown;
        jobId?: unknown;
        outputIndex?: unknown;
        starred?: unknown;
        createdAt?: unknown;
      };
      const src =
        typeof record.src === "string"
          ? record.src
          : typeof record.url === "string"
            ? record.url
            : "";
      if (!src) return null;
      const fallbackSrc =
        typeof record.fallbackSrc === "string"
          ? record.fallbackSrc
          : typeof record.fallbackUrl === "string"
            ? record.fallbackUrl
            : undefined;
      const sourceSrc =
        typeof record.sourceSrc === "string"
          ? record.sourceSrc
          : typeof record.sourceUrl === "string"
            ? record.sourceUrl
            : undefined;
      const media = withDirectAssetSrc(src, fallbackSrc, sourceSrc);
      const id =
        typeof record.id === "string"
          ? record.id
          : typeof record.mediaId === "string"
            ? record.mediaId
          : typeof record.assetId === "string"
            ? record.assetId
            : `${idPrefix}-metadata-${index}`;
      return {
        id,
        src: media.src,
        thumbnailSrc:
          typeof record.thumbnailSrc === "string"
            ? record.thumbnailSrc
            : typeof record.thumbnailUrl === "string"
              ? record.thumbnailUrl
              : undefined,
        fallbackSrc: media.fallbackSrc,
        sourceSrc: media.sourceSrc,
        mediaId: typeof record.mediaId === "string" ? record.mediaId : undefined,
        kind:
          record.kind === "video"
            ? "video"
            : record.kind === "image"
              ? "image"
              : fallbackKind,
        prompt: typeof record.prompt === "string" ? record.prompt : prompt,
        messageId: typeof record.messageId === "string" ? record.messageId : undefined,
        chatSessionId:
          typeof record.chatSessionId === "string" ? record.chatSessionId : undefined,
        jobId: typeof record.jobId === "string" ? record.jobId : undefined,
        outputIndex:
          typeof record.outputIndex === "number" && Number.isInteger(record.outputIndex)
            ? record.outputIndex
            : undefined,
        starred: typeof record.starred === "boolean" ? record.starred : undefined,
        createdAt: metadataResultCreatedAt(record.createdAt),
      };
    })
    .filter((item): item is StudioResult => Boolean(item));
};

export const studioResultsFromUrls = (
  urls: string[],
  prompt: string,
  kind: StudioMode,
  idPrefix: string,
  jobId?: string | null,
  fallbackUrls: string[] = [],
  chatSessionId?: string | null,
): StudioResult[] =>
  urls.filter(Boolean).map((src, index) => {
    const media = withDirectAssetSrc(src, fallbackUrls[index]);
    return {
      id: `${idPrefix}-${index}`,
      src: media.src,
      thumbnailSrc: jobId && kind === "image"
        ? `/api/generation/jobs/${encodeURIComponent(jobId)}/output/${index}/content?variant=thumbnail`
        : undefined,
      fallbackSrc: media.fallbackSrc,
      sourceSrc: media.sourceSrc,
      kind,
      prompt,
      chatSessionId: chatSessionId ?? undefined,
      jobId: jobId ?? undefined,
      outputIndex: jobId ? index : undefined,
    };
  });

export const studioResultsFromJob = (
  job: GenerationJobPublic,
  prompt: string,
  kind: StudioMode,
  idPrefix: string,
): StudioResult[] => {
  if (job.outputItems?.length) {
    return job.outputItems
      .filter((item) => Boolean(item.url))
      .map((item, index) => {
        const media = withDirectAssetSrc(
          item.url,
          item.fallbackUrl ?? undefined,
          item.sourceUrl,
        );
        return {
          id: `${idPrefix}-${index}`,
          src: media.src,
          thumbnailSrc: item.thumbnailUrl ?? undefined,
          fallbackSrc: media.fallbackSrc,
          sourceSrc: media.sourceSrc,
          mediaId: item.mediaId ?? undefined,
          kind,
          prompt,
          chatSessionId: job.chatSessionId ?? undefined,
          jobId: job.id,
          outputIndex: index,
        };
      });
  }
  return studioResultsFromUrls(
    job.outputUrls,
    prompt,
    kind,
    idPrefix,
    job.id,
    job.providerOutputUrls ?? [],
    job.chatSessionId,
  );
};

export const studioMessageFromRecord = (
  record: ChatSessionDetail["messages"][number],
): StudioMessage | null => {
  const createdAt = new Date(record.createdAt).getTime();
  const metadata = record.metadata ?? {};
  const settings = metadataSettings(metadata);

  if (record.role === "user") {
    return {
      id: record.id,
      role: "user",
      text: record.content,
      settings,
      metadata,
      createdAt,
    };
  }

  if (record.role !== "assistant") return null;

  const job = record.generationJob;
  const assistantSettings = job
    ? defaultStudioSettings({
      ...settings,
      mode: job.type === "IMAGE2VIDEO" ? "video" : "image",
      model: job.modelCode || settings.model,
    })
    : settings;
  const statusFlag = typeof metadata.status === "string" ? metadata.status : undefined;
  const status =
    job?.status === "failed" || job?.status === "canceled" || statusFlag === "error"
      ? "error"
      : job && job.status !== "succeeded"
        ? "loading"
        : "done";
  const jobResults =
    status === "done" && job
      ? studioResultsFromJob(
        job,
        record.content,
        job.type === "IMAGE2VIDEO" ? "video" : "image",
        record.id,
      )
      : [];
  const extraResults =
    status === "done"
      ? metadataResults(
        metadata,
        record.content,
        job?.type === "IMAGE2VIDEO" ? "video" : "image",
        record.id,
      )
      : [];
  const existing = new Set(jobResults.map((result) => `${result.id}:${result.src}`));
  const results = [
    ...jobResults,
    ...extraResults.filter((result) => {
      const key = `${result.id}:${result.src}`;
      if (existing.has(key)) return false;
      existing.add(key);
      return true;
    }),
  ].map((result) => ({
    ...result,
    messageId: result.messageId ?? record.id,
  }));

  return {
    id: record.id,
    role: "assistant",
    text: record.content,
    status,
    results,
    settings: assistantSettings,
    generationJobId: job?.id ?? record.generationJobId ?? undefined,
    error: job?.errorMessage ?? (typeof metadata.error === "string" ? metadata.error : undefined),
    createdAt,
  };
};

export const collectStudioResults = (messages: StudioMessage[]) =>
  messages.flatMap((message) =>
    message.role === "assistant" && message.status === "done" ? message.results : [],
  );
