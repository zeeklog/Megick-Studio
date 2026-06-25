import type { ConcreteVideoInputMode } from "./types";

export const REFERENCE_UPLOAD_PREFIX = "generations/references";
export const FALLBACK_REFERENCE_MAX_EDGE = 1600;
export const MAX_STUDIO_REFERENCE_IMAGES = 5;
export const MAX_STUDIO_REFERENCE_MEDIA = 5;
export const STUDIO_REFERENCE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const STUDIO_REFERENCE_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const STUDIO_VIDEO_REFERENCE_IMAGE_MIN_DIMENSION = 240;
export const VIDEO_REFERENCE_VIDEO_GENERATION_MIN_SECONDS = 2;
export const VIDEO_REFERENCE_VIDEO_GENERATION_MAX_SECONDS = 10;
export const VIDEO_REFERENCE_MIN_SECONDS = 1;
export const VIDEO_REFERENCE_MAX_SECONDS = 30;
export const STUDIO_REFERENCE_IMAGE_EXTENSIONS = ["jpeg", "jpg", "png", "bmp", "webp"];
export const STUDIO_REFERENCE_VIDEO_EXTENSIONS = ["mp4", "mov"];
export const VIDEO_INPUT_MODES: ConcreteVideoInputMode[] = ["T2V", "I2V", "R2V", "EDIT"];
export const STUDIO_HANDOFF_PREFIX = "megick-studio-handoff:";
