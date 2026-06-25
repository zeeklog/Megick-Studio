import type { ChatSession, ChatSessionDetail, StudioResult } from "@/routes/-dashboard-types";
import { studioMessageFromRecord } from "@/routes/-dashboard-types";
import { api, apiGet } from "@/lib/api-client";
import { processMediaAssets } from "@/megickcut/media/processing";
import type { MediaAsset } from "@/megickcut/media/types";
import { buildElementFromMedia } from "@/megickcut/timeline/element-utils";
import { mediaTimeFromSeconds, ZERO_MEDIA_TIME } from "@/megickcut/wasm";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/megickcut/timeline/creation";
import type { EditorCore } from "@/megickcut/core";

export type SessionImportKind = "image" | "video";

export interface SessionMediaItem extends StudioResult {
  sessionId: string;
  sessionTitle: string;
  messageId: string;
  sourceKey: string;
}

export function studioMediaSourceKey({
  sessionId,
  messageId,
  resultId,
}: {
  sessionId: string;
  messageId: string;
  resultId: string;
}) {
  return `studio:${sessionId}:${messageId}:${resultId}`;
}

export async function listStudioSessions() {
  return apiGet<ChatSession[]>("/api/chats");
}

export async function getStudioSession({ sessionId }: { sessionId: string }) {
  return apiGet<ChatSessionDetail>(`/api/chats/${encodeURIComponent(sessionId)}`);
}

export function collectImportableSessionMedia({
  session,
  kinds = ["image", "video"],
}: {
  session: ChatSessionDetail;
  kinds?: SessionImportKind[];
}): SessionMediaItem[] {
  const allowed = new Set<string>(kinds);
  const items: SessionMediaItem[] = [];

  for (const message of session.messages) {
    const studioMessage = studioMessageFromRecord(message);
    if (!studioMessage || studioMessage.role !== "assistant" || studioMessage.status !== "done") {
      continue;
    }

    for (const result of studioMessage.results) {
      if (!allowed.has(result.kind)) continue;
      items.push(toSessionMediaItem({ session, messageId: message.id, result }));
    }
  }

  return uniqueBySource(items);
}

export function findSessionMediaByResultId({
  session,
  messageId,
  resultId,
}: {
  session: ChatSessionDetail;
  messageId: string;
  resultId: string;
}) {
  return collectImportableSessionMedia({ session }).find(
    (item) => item.messageId === messageId && item.id === resultId,
  );
}

export function createSessionMediaItem({
  sessionId,
  sessionTitle,
  messageId,
  result,
}: {
  sessionId: string;
  sessionTitle: string;
  messageId: string;
  result: StudioResult;
}) {
  return toSessionMediaItem({
    session: {
      id: sessionId,
      title: sessionTitle,
      pinned: false,
      updatedAt: "",
      createdAt: "",
      messages: [],
    },
    messageId,
    result,
  });
}

export async function importSessionMediaItem({
  editor,
  projectId,
  item,
  insertOnTimeline = false,
}: {
  editor: EditorCore;
  projectId: string;
  item: SessionMediaItem;
  insertOnTimeline?: boolean;
}) {
  const existing = editor.media.getAssets().find((asset) => asset.sourceKey === item.sourceKey);

  const asset =
    existing ??
    (await importRemoteAsset({
      editor,
      projectId,
      item,
    }));

  if (!asset) return null;

  if (insertOnTimeline && !timelineHasMedia({ editor, mediaId: asset.id })) {
    const duration =
      asset.duration != null
        ? mediaTimeFromSeconds({ seconds: asset.duration })
        : DEFAULT_NEW_ELEMENT_DURATION;
    editor.timeline.insertElement({
      element: buildElementFromMedia({
        mediaId: asset.id,
        mediaType: asset.type,
        name: asset.name,
        duration,
        startTime: ZERO_MEDIA_TIME,
      }),
      placement: { mode: "auto" },
    });
  }

  return asset;
}

export async function saveExportBackToSession({
  sessionId,
  sourceMessageId,
  sourceResultId,
  buffer,
  filename,
  mimeType,
}: {
  sessionId: string;
  sourceMessageId?: string;
  sourceResultId?: string;
  buffer: ArrayBuffer;
  filename: string;
  mimeType: string;
}) {
  const blob = new Blob([buffer], { type: mimeType });
  const file = new File([blob], filename, { type: mimeType });
  const form = new FormData();
  form.set("file", file);

  if (sourceMessageId) {
    if (sourceResultId) form.set("sourceResultId", sourceResultId);
    return api(
      `/api/chats/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(sourceMessageId)}/edited-results`,
      {
        method: "POST",
        body: form,
        headers: { Accept: "application/json" },
      },
    );
  }

  form.set("content", "Megick video edit");
  form.set(
    "metadata",
    JSON.stringify({
      status: "done",
      edited: true,
      label: "Megick edit",
      sourceResultIds: sourceResultId ? [sourceResultId] : [],
    }),
  );
  if (sourceResultId) form.set("sourceResultId", sourceResultId);
  return api(`/api/chats/${encodeURIComponent(sessionId)}/media-results`, {
    method: "POST",
    body: form,
    headers: { Accept: "application/json" },
  });
}

function toSessionMediaItem({
  session,
  messageId,
  result,
}: {
  session: ChatSessionDetail;
  messageId: string;
  result: StudioResult;
}): SessionMediaItem {
  return {
    ...result,
    sessionId: session.id,
    sessionTitle: session.title,
    messageId,
    sourceKey: studioMediaSourceKey({
      sessionId: session.id,
      messageId,
      resultId: result.id,
    }),
  };
}

function uniqueBySource(items: SessionMediaItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.sourceKey)) return false;
    seen.add(item.sourceKey);
    return true;
  });
}

async function importRemoteAsset({
  editor,
  projectId,
  item,
}: {
  editor: EditorCore;
  projectId: string;
  item: SessionMediaItem;
}) {
  const blob = await fetchMediaBlob(item);
  const extension = mediaExtension({ blob, kind: item.kind });
  const file = new File([blob], safeFileName({ item, extension }), {
    type: blob.type || (item.kind === "video" ? "video/mp4" : "image/png"),
    lastModified: Date.now(),
  });
  const [processed] = await processMediaAssets({ files: [file] });
  if (!processed) return null;
  const enriched = {
    ...processed,
    sourceKey: item.sourceKey,
    sourceSessionId: item.sessionId,
    sourceMessageId: item.messageId,
    sourceResultId: item.id,
    sourceKind: item.kind,
  };
  return editor.media.addMediaAsset({ projectId, asset: enriched });
}

async function fetchMediaBlob(item: SessionMediaItem) {
  let lastError: unknown;
  for (const url of downloadCandidates(item)) {
    try {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.blob();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Unable to download media");
}

function downloadCandidates(item: SessionMediaItem) {
  return [
    item.jobId != null && Number.isInteger(item.outputIndex)
      ? `/api/generation/jobs/${encodeURIComponent(item.jobId)}/output/${item.outputIndex}/content`
      : null,
    assetContentUrl(item.src),
    item.src,
    assetContentUrl(item.fallbackSrc),
    item.fallbackSrc,
    assetContentUrl(item.sourceSrc),
    item.sourceSrc,
  ].filter((url, index, urls): url is string => Boolean(url) && urls.indexOf(url) === index);
}

function assetContentUrl(raw: string | undefined) {
  if (!raw) return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.pathname === "/api/oss/assets/content" || url.pathname === "/api/oss/sign") {
      const key = normalizeKey(url.searchParams.get("key"));
      return key ? `/api/oss/assets/content?key=${encodeURIComponent(key)}` : null;
    }
    const key = normalizeKey(decodeURIComponent(url.pathname.replace(/^\/+/, "")));
    return key ? `/api/oss/assets/content?key=${encodeURIComponent(key)}` : null;
  } catch {
    const key = normalizeKey(raw);
    return key ? `/api/oss/assets/content?key=${encodeURIComponent(key)}` : null;
  }
}

function normalizeKey(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim().replace(/^\/+/, "").split(/[!@?]/)[0];
  if (
    !trimmed ||
    trimmed.includes("..") ||
    trimmed.startsWith("http") ||
    trimmed.startsWith("blob:")
  ) {
    return null;
  }
  return trimmed;
}

function mediaExtension({ blob, kind }: { blob: Blob; kind: SessionImportKind }) {
  const type = blob.type.toLowerCase();
  if (kind === "video") {
    if (type.includes("webm")) return "webm";
    if (type.includes("quicktime")) return "mov";
    return "mp4";
  }
  if (type.includes("jpeg")) return "jpg";
  if (type.includes("webp")) return "webp";
  return "png";
}

function safeFileName({ item, extension }: { item: SessionMediaItem; extension: string }) {
  const stem =
    item.prompt
      ?.slice(0, 48)
      .replace(/[<>:"/\\|?*]/g, "-")
      .trim() || `megick-${item.kind}`;
  return `${stem}.${extension}`;
}

function timelineHasMedia({ editor, mediaId }: { editor: EditorCore; mediaId: string }) {
  const scene = editor.scenes.getActiveSceneOrNull();
  if (!scene) return false;
  const tracks = [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio];
  return tracks.some((track) =>
    track.elements.some((element) => "mediaId" in element && element.mediaId === mediaId),
  );
}
