import { apiPost } from "@/lib/api-client";

export type OssPostPolicy = {
  host: string;
  accessKeyId: string;
  policy: string;
  signature: string;
  keyPrefix: string;
};

type RegisteredOssAsset = {
  id: string;
  key: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
};

export type DirectOssUploadResult = {
  key: string;
  signedUrl: string;
  publicUrl: string;
  asset: RegisteredOssAsset;
};

function extensionFromContentType(type: string | undefined) {
  const lower = type?.toLowerCase() ?? "";
  if (lower.includes("jpeg")) return "jpg";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("png")) return "png";
  if (lower.includes("gif")) return "gif";
  if (lower.includes("mp4")) return "mp4";
  if (lower.includes("quicktime")) return "mov";
  if (lower.includes("webm")) return "webm";
  return "bin";
}

export function safeOssAssetName(name: string | undefined, fallback: string) {
  return (name || fallback).replace(/[^\w.-]+/g, "-").slice(-96) || fallback;
}

type OssThumbnailOptions = {
  width?: number;
  height?: number;
  quality?: number;
};

const DEFAULT_OSS_THUMBNAIL_OPTIONS = {
  width: 320,
  height: 320,
  quality: 72,
} satisfies Required<OssThumbnailOptions>;

function normalizeThumbnailNumber(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value) || !value) return fallback;
  return Math.min(Math.max(Math.round(value), 64), 2048);
}

function ossThumbnailProcess(options: OssThumbnailOptions = {}) {
  const width = normalizeThumbnailNumber(options.width, DEFAULT_OSS_THUMBNAIL_OPTIONS.width);
  const height = normalizeThumbnailNumber(options.height, DEFAULT_OSS_THUMBNAIL_OPTIONS.height);
  const quality = normalizeThumbnailNumber(options.quality, DEFAULT_OSS_THUMBNAIL_OPTIONS.quality);
  return `image/resize,m_lfit,w_${width},h_${height}/format,webp/quality,q_${quality}`;
}

function appendOssProcess(src: string, process: string) {
  const sep = src.includes("?") ? "&" : "?";
  return `${src}${sep}x-oss-process=${encodeURIComponent(process)}`;
}

/**
 * Append OSS image processing parameter to fetch a thumbnail instead of the full image.
 *
 * - For **signed URLs** (containing OSSAccessKeyId + Signature): extracts the key
 *   and returns a proxy URL via /api/oss/sign?key=...&x-oss-process=...
 *   The server generates a new signature that covers the process parameter.
 * - For **unsigned public URLs** (custom domain, aliyuncs.com): appends
 *   ?x-oss-process=... directly — valid because no signature exists.
 * - Skips data: URLs and non-OSS URLs (returns unchanged).
 */
export function ossThumbnailUrl(
  src: string | undefined | null,
  options: OssThumbnailOptions = {},
): string | undefined {
  if (!src) return undefined;
  if (src.startsWith("data:")) return src;
  const process = ossThumbnailProcess(options);

  // Local OSS proxy URLs can be redirected with a server-side processed signature.
  if (/^\/?api\/oss\/(?:sign|assets\/content)(?:\?|$)/i.test(src)) {
    try {
      const url = new URL(src.startsWith("/") ? src : `/${src}`, "http://local");
      const key = url.searchParams.get("key");
      if (key) {
        return `/api/oss/sign?key=${encodeURIComponent(key)}&x-oss-process=${encodeURIComponent(process)}`;
      }
    } catch { /* fall through */ }
    return appendOssProcess(src, process);
  }

  // Signed OSS URL — must proxy through server to re-sign with the process param
  if (src.includes("OSSAccessKeyId") && src.includes("Signature")) {
    // Extract key from the URL path (works for both direct and custom domain)
    try {
      const url = new URL(src.startsWith("/") ? `http://local${src}` : src);
      const key = url.pathname.replace(/^\/+/, "").split(/[!@]/)[0];
      if (key) {
        return `/api/oss/sign?key=${encodeURIComponent(key)}&x-oss-process=${encodeURIComponent(process)}`;
      }
    } catch { /* fall through */ }
    return src;
  }

  // Unsigned public URL — safe to append process parameter directly
  const isOss = /file\.megick\.com|aliyuncs\.com|\.oss-/.test(src);
  if (!isOss) return src;
  return appendOssProcess(src, process);
}

export async function uploadDirectOssAsset({
  file,
  name,
  prefix,
  maxSizeBytes,
}: {
  file: Blob;
  name?: string;
  prefix: string;
  maxSizeBytes?: number;
}): Promise<DirectOssUploadResult | null> {
  const contentType = file.type || "application/octet-stream";
  const policy = await apiPost<OssPostPolicy | null>("/api/oss/sign", {
    prefix,
    contentType,
    maxSizeBytes,
  });
  if (!policy) return null;

  const safeName = safeOssAssetName(
    name,
    `asset.${extensionFromContentType(contentType)}`,
  );
  const key = `${policy.keyPrefix}${Date.now()}-${safeName}`;
  const form = new FormData();
  form.append("key", key);
  form.append("OSSAccessKeyId", policy.accessKeyId);
  form.append("policy", policy.policy);
  form.append("Signature", policy.signature);
  form.append("success_action_status", "200");
  form.append("Content-Type", contentType);
  form.append("file", file, safeName);

  const uploadResponse = await fetch(policy.host, { method: "POST", body: form });
  if (!uploadResponse.ok) throw new Error(`Upload failed: ${uploadResponse.status}`);

  const asset = await apiPost<RegisteredOssAsset>("/api/oss/assets", {
    key,
    contentType,
    sizeBytes: file.size,
  });

  return {
    key,
    signedUrl: `/api/oss/sign?key=${encodeURIComponent(key)}`,
    publicUrl: `${policy.host.replace(/\/+$/, "")}/${key}`,
    asset,
  };
}
