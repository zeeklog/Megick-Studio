import { ossThumbnailUrl } from "@/lib/oss-upload";

export function templateCardImageUrl(src: string | null | undefined) {
  return ossThumbnailUrl(src, { width: 520, height: 390, quality: 72 });
}

export function templateDetailImageUrl(src: string | null | undefined) {
  return ossThumbnailUrl(src, { width: 1280, height: 960, quality: 76 });
}

export function templateReferencePreviewUrl(src: string | null | undefined) {
  return ossThumbnailUrl(src, { width: 720, height: 540, quality: 74 });
}
