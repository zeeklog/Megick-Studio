import type { OssAsset } from "@prisma/client";

export const FREE_IMAGE_WATERMARK_PROCESS = "style/megick";

export interface RawGenerationOutput {
  asset?: OssAsset;
  assetUrl?: string | null;
  providerUrl?: string | null;
}

export interface PublicGenerationOutput {
  url: string;
  thumbnailUrl?: string | null;
  fallbackUrl: string | null;
  sourceUrl: string | null;
  mediaId: string | null;
  assetId: string | null;
  assetKey: string | null;
}

export function generationOutputProxyUrl(jobId: string, index: number) {
  return `/api/generation/jobs/${encodeURIComponent(jobId)}/output/${index}/content`;
}

export function mediaOutputProxyUrl(mediaId: string, variant?: "thumbnail") {
  const base = `/api/generation/jobs/provider-output/${encodeURIComponent(mediaId)}/content`;
  return variant ? `${base}?variant=${variant}` : base;
}

export function buildPublicGenerationOutputItems(
  jobId: string,
  type: string,
  outputs: RawGenerationOutput[],
  hasAdvancedAccess: boolean,
): PublicGenerationOutput[] {
  return outputs
    .map((output, index): PublicGenerationOutput | null => {
      const isImageOutput = type === "TEXT2IMAGE" || type === "IMAGE_EDIT";
      if (isImageOutput) {
        if (!output.asset || !output.assetUrl) return null;
        return {
          url: output.assetUrl,
          fallbackUrl: null,
          sourceUrl: null,
          mediaId: null,
          assetId: hasAdvancedAccess ? output.asset.id : null,
          assetKey: hasAdvancedAccess ? output.asset.key : null,
        };
      }

      const sourceUrl = output.providerUrl ?? null;
      const url = output.assetUrl ?? sourceUrl;
      if (!url) return null;
      return {
        url,
        fallbackUrl: null,
        sourceUrl: hasAdvancedAccess ? sourceUrl : null,
        mediaId: null,
        assetId: output.asset?.id ?? null,
        assetKey: output.asset?.key ?? null,
      };
    })
    .filter((item): item is PublicGenerationOutput => Boolean(item));
}

export function publicProviderOutputUrls(
  type: string,
  providerUrls: string[],
  hasAdvancedAccess: boolean,
) {
  if (type === "TEXT2IMAGE" || type === "IMAGE_EDIT") return [];
  return providerUrls;
}
