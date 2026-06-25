import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";

export const FEATURE_VIDEO_GENERATION_ENABLED_KEY = "features.videoGenerationEnabled";

export interface SiteSettingRow {
  key: string;
  value: unknown;
  scope: string | null;
}

function readBooleanSetting(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  if (value && typeof value === "object" && "enabled" in value) {
    return (value as { enabled?: unknown }).enabled === true;
  }
  return fallback;
}

export function videoGenerationEnabledFromSettings(settings: SiteSettingRow[] | undefined) {
  const value = settings?.find((row) => row.key === FEATURE_VIDEO_GENERATION_ENABLED_KEY)?.value;
  return readBooleanSetting(value, false);
}

export function useVideoGenerationEnabled(options?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: ["site-settings", "features"],
    queryFn: () =>
      apiGet<SiteSettingRow[]>("/api/site-settings", { query: { scope: "features" } }),
    enabled: options?.enabled ?? true,
    staleTime: 30000,
  });

  return {
    videoGenerationEnabled: videoGenerationEnabledFromSettings(query.data),
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
  };
}
