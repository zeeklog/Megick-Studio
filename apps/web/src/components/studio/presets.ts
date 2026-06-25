export type StylePreset = {
  id: string;
  label: string;
  promptSuffix: string;
};

export const STYLE_PRESETS: StylePreset[] = [
  { id: "none", label: "No style", promptSuffix: "" },
  {
    id: "cinematic",
    label: "Cinematic",
    promptSuffix: "cinematic lighting, film grain, dramatic composition, ultra detailed",
  },
  {
    id: "anime",
    label: "Anime",
    promptSuffix: "anime style, vibrant colors, clean line art, cel shaded",
  },
  {
    id: "ghibli",
    label: "Ghibli",
    promptSuffix: "studio ghibli style, soft pastel palette, dreamy atmosphere",
  },
  {
    id: "photoreal",
    label: "Photoreal",
    promptSuffix: "photorealistic, 8k, ultra detailed, natural lighting",
  },
  { id: "3d", label: "3D render", promptSuffix: "octane render, 3d art, soft global illumination" },
  {
    id: "cyberpunk",
    label: "Cyberpunk",
    promptSuffix: "cyberpunk, neon lights, rain reflections, futuristic",
  },
  {
    id: "watercolor",
    label: "Watercolor",
    promptSuffix: "watercolor painting, soft brush strokes, paper texture",
  },
  {
    id: "ink",
    label: "Ink",
    promptSuffix: "chinese ink painting, sumi-e, minimalistic, monochrome",
  },
  { id: "pixar", label: "Pixar", promptSuffix: "pixar 3d animation style, cute, expressive" },
  {
    id: "vaporwave",
    label: "Vaporwave",
    promptSuffix: "vaporwave aesthetic, retro 80s, magenta and cyan gradients",
  },
  { id: "lowpoly", label: "Low poly", promptSuffix: "low poly, geometric shapes, flat shading" },
  {
    id: "isometric",
    label: "Isometric",
    promptSuffix: "isometric illustration, clean vector, soft shadows",
  },
];

export type RatioPreset = {
  id: string;
  size: string;
  iconW: number;
  iconH: number;
};

export const RATIO_PRESETS: RatioPreset[] = [
  { id: "1:1", size: "1024x1024", iconW: 12, iconH: 12 },
  { id: "16:9", size: "1280x720", iconW: 16, iconH: 9 },
  { id: "21:9", size: "1344x576", iconW: 21, iconH: 9 },
  { id: "9:16", size: "720x1280", iconW: 9, iconH: 16 },
  { id: "4:3", size: "1152x896", iconW: 14, iconH: 10 },
  { id: "3:4", size: "896x1152", iconW: 10, iconH: 14 },
];

export const MODELS = [
  { id: "gpt-image-2", label: "Megick · v2 (default)" },
  { id: "gpt-image-1", label: "Megick · v1" },
];

export function ratioToSize(ratio: string): string {
  return RATIO_PRESETS.find((r) => r.id === ratio)?.size ?? "1024x1024";
}

export function styleSuffix(style: string): string {
  return STYLE_PRESETS.find((s) => s.id === style)?.promptSuffix ?? "";
}

export function buildFinalPrompt(opts: {
  prompt: string;
  style: string;
  negative?: string;
  seed?: number | null;
}): string {
  const parts: string[] = [opts.prompt.trim()];
  const suffix = styleSuffix(opts.style);
  if (suffix) parts.push(suffix);
  if (opts.negative?.trim()) parts.push(`avoid: ${opts.negative.trim()}`);
  if (opts.seed != null) parts.push(`seed: ${opts.seed}`);
  return parts.filter(Boolean).join(", ");
}
