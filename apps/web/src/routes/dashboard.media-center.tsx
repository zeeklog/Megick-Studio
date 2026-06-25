import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Download,
  ExternalLink,
  Image as ImageIcon,
  Lock,
  Search,
  ShieldCheck,
  Video,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { MediaCenterItem, MediaCenterKind, MediaCenterResponse } from "@megick/api-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { apiGet } from "@/lib/api-client";
import { asSearchRecord, optionalEnum, optionalString } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { getInitialLocale, localeToIntl, translate, useI18n } from "@/lib/i18n";
import { EmptyState, LoadingRows, formatDateTime } from "./-dashboard-components";
import { studioPathForMode } from "./-dashboard-types";

const MEDIA_CENTER_TYPES = ["all", "image", "video"] as const;

function mediaCenterSearchSchema(input: unknown): {
  type?: (typeof MEDIA_CENTER_TYPES)[number];
  q?: string;
} {
  const search = asSearchRecord(input);
  return {
    type: optionalEnum(search.type, MEDIA_CENTER_TYPES),
    q: optionalString(search.q),
  };
}

export const Route = createFileRoute("/dashboard/media-center")({
  head: () => ({
    meta: [
      { title: translate(getInitialLocale(), "mediaCenter.meta.title") },
      { name: "description", content: translate(getInitialLocale(), "mediaCenter.meta.description") },
    ],
  }),
  validateSearch: mediaCenterSearchSchema,
  component: MediaCenterRoute,
});

function MediaCenterRoute() {
  const { user } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { t, locale, formatNumber } = useI18n();
  const [page, setPage] = useState(0);
  const kind = search.type ?? "all";
  const pageSize = 48;

  const mediaQ = useQuery({
    queryKey: ["dashboard", "media-center", kind, page],
    queryFn: () =>
      apiGet<MediaCenterResponse>("/api/media-center", {
        query: {
          kind,
          limit: pageSize,
          offset: page * pageSize,
        },
      }),
    enabled: !!user,
  });

  const items = mediaQ.data?.items ?? [];
  const keyword = search.q?.trim().toLowerCase() ?? "";
  const visibleItems = keyword
    ? items.filter((item) => item.prompt.toLowerCase().includes(keyword))
    : items;
  const counts = mediaQ.data?.counts ?? { all: 0, image: 0, video: 0 };
  const total = mediaQ.data?.total ?? 0;

  const handleKindChange = (nextKind: string) => {
    setPage(0);
    navigate({
      to: "/dashboard/media-center",
      search: {
        type: nextKind as MediaCenterKind,
        q: search.q || undefined,
      },
    });
  };

  const handleSearch = (value: string) => {
    navigate({
      to: "/dashboard/media-center",
      search: {
        type: kind,
        q: value.trim() || undefined,
      },
    });
  };

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex flex-col items-start justify-between gap-4 border-b border-border p-4 sm:flex-row sm:p-5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">{t("mediaCenter.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("mediaCenter.description")}</p>
        </div>
        <Button asChild className="w-full bg-gradient-primary sm:w-auto">
          <Link to="/dashboard/studio/image">
            {t("dashboard.newGeneration")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={kind} onValueChange={handleKindChange}>
          <TabsList className="grid w-full grid-cols-3 sm:w-auto">
            <TabsTrigger value="all">
              {t("mediaCenter.tab.all")} ({formatNumber(counts.all)})
            </TabsTrigger>
            <TabsTrigger value="image">
              {t("mediaCenter.tab.image")} ({formatNumber(counts.image)})
            </TabsTrigger>
            <TabsTrigger value="video">
              {t("mediaCenter.tab.video")} ({formatNumber(counts.video)})
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("mediaCenter.searchPlaceholder")}
            className="pl-9"
            defaultValue={search.q}
            onBlur={(event) => handleSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") handleSearch(event.currentTarget.value);
            }}
          />
        </div>
      </div>

      {mediaQ.isLoading && page === 0 ? (
        <LoadingRows />
      ) : visibleItems.length === 0 ? (
        <div className="p-6">
          <EmptyState title={t("mediaCenter.empty.title")} detail={t("mediaCenter.empty.detail")} />
        </div>
      ) : (
        <>
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {visibleItems.map((item) => (
              <MediaCard key={`${item.source}-${item.id}`} item={item} />
            ))}
          </div>
          <div className="flex flex-col items-stretch justify-between gap-3 border-t border-border p-4 sm:flex-row sm:items-center">
            <span className="text-sm text-muted-foreground">
              {t("mediaCenter.showing", {
                count: formatNumber(visibleItems.length),
                total: formatNumber(total),
              })}
            </span>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                {t("common.previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={(page + 1) * pageSize >= total}
                onClick={() => setPage(page + 1)}
              >
                {t("common.next")}
              </Button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function MediaCard({ item }: { item: MediaCenterItem }) {
  const { t, locale } = useI18n();
  const openTo =
    item.chatSessionId != null
      ? studioPathForMode(item.kind)
      : item.jobId != null
        ? "/dashboard/jobs/$jobId"
        : null;
  const previewUrl = item.kind === "image" ? (item.thumbnailUrl ?? item.ossThumbnailUrl ?? item.src) : item.src;
  const primaryDownloadUrl = item.downloadUrl ?? item.src;
  const dimension = item.width || item.height ? `${item.width ?? "-"} x ${item.height ?? "-"}` : null;
  const duration = item.durationMs ? `${Math.round(item.durationMs / 1000)}s` : null;
  const size = formatBytes(item.sizeBytes, locale);
  const accessLabel =
    item.originalAccess === "locked"
      ? t("mediaCenter.original.locked")
      : item.originalAccess === "available"
        ? t("mediaCenter.original.available")
        : t("mediaCenter.original.unavailable");
  const meta = [dimension, duration, size].filter(Boolean).join(" · ");

  return (
    <article className="group overflow-hidden rounded-lg border border-border bg-background/70 transition-colors hover:border-primary/35">
      <div className="relative aspect-[4/3] bg-black">
        {item.kind === "video" ? (
          <video
            src={previewUrl}
            muted
            playsInline
            preload="metadata"
            controls
            className="h-full w-full object-cover"
          />
        ) : (
          <img
            src={previewUrl}
            alt={item.prompt || t("mediaCenter.generatedAlt")}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          <Badge className="gap-1 bg-background/90 text-foreground hover:bg-background/90">
            {item.kind === "video" ? <Video className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
            {item.kind === "video" ? t("common.video") : t("common.image")}
          </Badge>
          <Badge variant="secondary" className="bg-background/90">
            {sourceLabel(item.source, t)}
          </Badge>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "absolute bottom-2 left-2 gap-1 border-white/20 bg-black/65 text-white",
            item.originalAccess === "locked" && "border-amber-300/50 text-amber-100",
          )}
        >
          {item.originalAccess === "locked" ? <Lock className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
          {accessLabel}
        </Badge>
      </div>

      <div className="min-w-0 space-y-3 p-3">
        <div className="flex items-center justify-between gap-3">
          <Badge variant="outline">{statusLabel(item.status, t)}</Badge>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatDateTime(item.createdAt, locale)}
          </span>
        </div>

        <p className="line-clamp-2 min-h-10 text-sm leading-relaxed">
          {item.prompt || t("mediaCenter.noPrompt")}
        </p>

        <div className="min-h-5 text-xs text-muted-foreground">
          {meta || t("mediaCenter.field.dimensions")}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {openTo ? (
            <Button asChild size="sm" variant="outline">
              <Link
                to={openTo}
                params={item.chatSessionId ? undefined : { jobId: item.jobId ?? "" }}
                search={
                  item.chatSessionId
                    ? { sessionId: item.chatSessionId, jobId: item.jobId ?? undefined }
                    : undefined
                }
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t("common.open")}
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <Button asChild size="sm" variant="outline">
            <a href={primaryDownloadUrl} target="_blank" rel="noreferrer">
              <Download className="h-3.5 w-3.5" />
              {t("studio.download")}
            </a>
          </Button>
        </div>
      </div>
    </article>
  );
}

function formatBytes(value: number | null | undefined, locale: ReturnType<typeof useI18n>["locale"]) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(localeToIntl(locale), {
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(size)} ${units[unit]}`;
}

function sourceLabel(source: MediaCenterItem["source"], t: ReturnType<typeof useI18n>["t"]) {
  if (source === "studio_edit") return t("mediaCenter.source.edit");
  if (source === "studio_media") return t("mediaCenter.source.studio");
  if (source === "user_upload") return t("mediaCenter.source.upload");
  if (source === "import") return t("mediaCenter.source.import");
  return t("mediaCenter.source.generation");
}

function statusLabel(status: MediaCenterItem["status"], t: ReturnType<typeof useI18n>["t"]) {
  if (status === "uploading") return t("mediaCenter.status.uploading");
  if (status === "processing") return t("mediaCenter.status.processing");
  if (status === "failed") return t("mediaCenter.status.failed");
  if (status === "deleted") return t("mediaCenter.status.deleted");
  if (status === "archived") return t("mediaCenter.status.archived");
  return t("mediaCenter.status.ready");
}
