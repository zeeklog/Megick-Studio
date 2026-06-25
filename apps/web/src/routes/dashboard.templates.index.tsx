import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  Check,
  Crown,
  Image as ImageIcon,
  LayoutTemplate,
  Search,
  Video,
  Wand2,
} from "lucide-react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type {
  PaginatedResponse,
  PromptTemplateCategoryPublic,
  PromptTemplatePublic,
} from "@megick/api-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet } from "@/lib/api-client";
import { templateCategoryLabel } from "@/lib/template-categories";
import { templateCardImageUrl } from "@/lib/template-images";
import { useVideoGenerationEnabled } from "@/lib/feature-flags";
import { asSearchRecord, optionalEnum, optionalString } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { getInitialLocale, translate, useI18n, type TranslationKey } from "@/lib/i18n";
import { noIndexHead } from "@/lib/seo";
import { EmptyState, LoadingRows } from "./-dashboard-components";
import { studioPathForMode } from "./-dashboard-types";

const TEMPLATE_TYPES = ["all", "image", "video"] as const;

export type TemplateSearch = {
  q?: string;
  category?: string;
  type?: (typeof TEMPLATE_TYPES)[number];
};

export function templateSearchSchema(input: unknown): TemplateSearch {
  const search = asSearchRecord(input);
  return {
    q: optionalString(search.q),
    category: optionalString(search.category),
    type: optionalEnum(search.type, TEMPLATE_TYPES),
  };
}

type TemplateCardMode = "default" | "select";
type TemplateBasePath = "/" | "/dashboard/template" | "/dashboard/templates" | "/templates";

const TEMPLATE_PAGE_SIZE = 20;
const TEMPLATE_PAGE_GRID_CLASSNAME =
  "columns-1 gap-3 sm:columns-2 lg:columns-3 xl:columns-4 2xl:columns-5";
const TEMPLATE_SELECT_GRID_CLASSNAME = "columns-1 gap-3 sm:columns-2 xl:columns-3";

export const Route = createFileRoute("/dashboard/templates/")({
  head: () =>
    noIndexHead({
      title: translate(getInitialLocale(), "templates.meta.title"),
      description: translate(getInitialLocale(), "templates.meta.description"),
    }),
  validateSearch: templateSearchSchema,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/dashboard/template", search });
  },
});

function asPlainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function templateMode(template: PromptTemplatePublic): "image" | "video" {
  return template.type === "IMAGE2VIDEO" ? "video" : "image";
}

type TemplatePromptTranslator = (key: TranslationKey, values?: Record<string, string | number>) => string;

export function templatePromptText(
  template: PromptTemplatePublic,
  t?: TemplatePromptTranslator,
) {
  return [
    template.textPrompt,
    template.materialPrompt
      ? t
        ? t("templates.detail.materialPromptLine", { material: template.materialPrompt })
        : `Material notes: ${template.materialPrompt}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function templateStyleValue(template: PromptTemplatePublic, fallback = "none") {
  const params = asPlainRecord(template.params);
  const settings = asPlainRecord(params.settings);
  return typeof settings.style === "string" ? settings.style : fallback;
}

export function templateRatioValue(template: PromptTemplatePublic, fallback = "1:1") {
  const params = asPlainRecord(template.params);
  const settings = asPlainRecord(params.settings);

  if (typeof settings.ratio === "string") return settings.ratio;
  if (typeof params.ratio === "string") return params.ratio;
  if (typeof params.aspect_ratio === "string") return params.aspect_ratio;
  return fallback;
}

export function templatePrimaryImageReference(template: PromptTemplatePublic) {
  const candidates = [template.referenceUrls[0], template.exampleUrl].filter(
    (value): value is string => Boolean(value),
  );
  const src = candidates.find((value) => !/\.(mp4|webm|mov)(\?|#|$)/i.test(value));
  if (!src) return null;
  return {
    src,
    name: template.referenceAssetKeys[0] ?? template.title,
  };
}

export function TemplateCenterPage({
  search,
  basePath = "/dashboard/templates",
  showControls = true,
  showSummary = true,
  cardMode = "default",
  selectedTemplateId,
  onTemplateSelect,
  onSearchChange,
  initialCategories,
  initialTemplatesPage,
  initialVideoGenerationEnabled,
  className,
  gridClassName,
}: {
  search: TemplateSearch;
  basePath?: TemplateBasePath;
  showControls?: boolean;
  showSummary?: boolean;
  cardMode?: TemplateCardMode;
  selectedTemplateId?: string | null;
  onTemplateSelect?: (template: PromptTemplatePublic) => void;
  onSearchChange?: (search: TemplateSearch) => void;
  initialCategories?: PromptTemplateCategoryPublic[];
  initialTemplatesPage?: PaginatedResponse<PromptTemplatePublic>;
  initialVideoGenerationEnabled?: boolean;
  className?: string;
  gridClassName?: string;
}) {
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState(search.q ?? "");
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const fetchingNextRef = useRef(false);
  const featureFlagsQ = useVideoGenerationEnabled({
    enabled: initialVideoGenerationEnabled === undefined,
  });
  const videoGenerationEnabled =
    initialVideoGenerationEnabled ?? featureFlagsQ.videoGenerationEnabled;
  const videoFlagLoading =
    initialVideoGenerationEnabled === undefined ? featureFlagsQ.isLoading : false;

  useEffect(() => {
    setKeyword(search.q ?? "");
  }, [search.q]);

  const type = videoGenerationEnabled
    ? (search.type ?? "all")
    : search.type === "image"
      ? "image"
      : "all";
  const filters = useMemo(
    () => ({
      type: type === "image" ? "TEXT2IMAGE" : type === "video" ? "IMAGE2VIDEO" : undefined,
      category: search.category,
      q: search.q,
    }),
    [search.category, search.q, type],
  );

  const templatesQ = useInfiniteQuery({
    queryKey: ["templates", "center", basePath, filters],
    queryFn: ({ pageParam }) =>
      apiGet<PaginatedResponse<PromptTemplatePublic>>("/api/templates", {
        query: {
          ...filters,
          compact: true,
          page: Number(pageParam) || 1,
          pageSize: TEMPLATE_PAGE_SIZE,
        },
      }),
    initialData: initialTemplatesPage
      ? {
          pages: [initialTemplatesPage],
          pageParams: [1],
        }
      : undefined,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
    staleTime: 300_000,
  });
  const categoriesQ = useQuery({
    queryKey: ["templates", "categories"],
    queryFn: () => apiGet<PromptTemplateCategoryPublic[]>("/api/templates/categories"),
    enabled: showControls,
    initialData: initialCategories,
    staleTime: 300_000,
  });

  const updateSearch = (patch: Partial<TemplateSearch>) => {
    const next = {
      q: search.q,
      category: search.category,
      type,
      ...patch,
    };
    const normalizedSearch: TemplateSearch = {
      q: next.q?.trim() || undefined,
      category: next.category || undefined,
      type: next.type && next.type !== "all" ? next.type : undefined,
    };
    if (onSearchChange) {
      onSearchChange(normalizedSearch);
      return;
    }
    navigate({
      to: basePath,
      search: normalizedSearch,
    });
  };

  useEffect(() => {
    if (videoFlagLoading || videoGenerationEnabled || search.type !== "video") return;
    const nextSearch: TemplateSearch = {
      q: search.q?.trim() || undefined,
      category: search.category || undefined,
      type: undefined,
    };
    if (onSearchChange) {
      onSearchChange(nextSearch);
      return;
    }
    navigate({
      to: basePath,
      search: nextSearch,
      replace: true,
    });
  }, [
    basePath,
    navigate,
    onSearchChange,
    search.category,
    search.q,
    search.type,
    videoFlagLoading,
    videoGenerationEnabled,
  ]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    updateSearch({ q: keyword });
  };

  const pagesLoaded = templatesQ.data?.pages.length ?? 0;
  const lastPageItemCount = templatesQ.data?.pages.at(-1)?.items.length ?? 0;

  useEffect(() => {
    fetchingNextRef.current = templatesQ.isFetchingNextPage;
  }, [templatesQ.isFetchingNextPage]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !templatesQ.hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting || fetchingNextRef.current) return;
        fetchingNextRef.current = true;
        void templatesQ.fetchNextPage().finally(() => {
          fetchingNextRef.current = false;
        });
      },
      { rootMargin: "360px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [templatesQ.fetchNextPage, templatesQ.hasNextPage]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (
      !node ||
      !templatesQ.hasNextPage ||
      templatesQ.isFetchingNextPage ||
      lastPageItemCount === 0 ||
      fetchingNextRef.current
    ) {
      return;
    }
    const rect = node.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top > viewportHeight + 360) return;

    fetchingNextRef.current = true;
    void templatesQ.fetchNextPage().finally(() => {
      fetchingNextRef.current = false;
    });
  }, [
    lastPageItemCount,
    pagesLoaded,
    templatesQ.fetchNextPage,
    templatesQ.hasNextPage,
    templatesQ.isFetchingNextPage,
  ]);

  const templates = useMemo(() => {
    const items = templatesQ.data?.pages.flatMap((page) => page.items) ?? [];
    const byId = new Map<string, PromptTemplatePublic>();
    for (const item of items) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
    return Array.from(byId.values());
  }, [templatesQ.data]);
  const categories = showControls ? (categoriesQ.data ?? []) : [];
  const featuredCount = templates.filter((item) => item.isFeatured).length;
  const totalCount = templatesQ.data?.pages[0]?.total ?? templates.length;
  const defaultGridClassName =
    cardMode === "select" ? TEMPLATE_SELECT_GRID_CLASSNAME : TEMPLATE_PAGE_GRID_CLASSNAME;

  const openTemplateDetail = (templateId: string) => {
    const detailPath =
      basePath === "/dashboard/template"
        ? "/dashboard/template/$templateId"
        : "/dashboard/templates/$templateId";
    void navigate({
      to: detailPath,
      params: { templateId },
    });
  };

  const startGenerating = (template: PromptTemplatePublic) => {
    const mode = templateMode(template);
    void navigate({
      to: studioPathForMode(mode),
      search: { templateId: template.id },
    });
  };

  return (
    <section className={cn("space-y-5", className)}>
      {showControls ? (
        <section className="rounded-lg border border-border bg-card">
          <div className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <form onSubmit={submitSearch} className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder={t("templates.searchPlaceholder")}
                  className="h-10 bg-background pl-9"
                />
              </form>

              <Tabs
                value={type}
                onValueChange={(value) => updateSearch({ type: value as TemplateSearch["type"] })}
              >
                <TabsList
                  className={cn(
                    "grid w-full",
                    videoGenerationEnabled ? "grid-cols-3" : "grid-cols-2",
                    "lg:w-auto",
                  )}
                >
                  <TabsTrigger value="all" className="px-2">
                    {t("templates.type.all")}
                  </TabsTrigger>
                  <TabsTrigger value="image" className="px-2">
                    <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
                    {t("studio.mode.image")}
                  </TabsTrigger>
                  {videoGenerationEnabled ? (
                    <TabsTrigger value="video" className="px-2">
                      <Video className="mr-1.5 h-3.5 w-3.5" />
                      {t("studio.mode.video")}
                    </TabsTrigger>
                  ) : null}
                </TabsList>
              </Tabs>
            </div>

            <div className="flex max-w-full flex-wrap gap-2">
              <button
                type="button"
                onClick={() => updateSearch({ category: undefined })}
                className={cn(
                  "min-h-8 rounded-md border px-3 py-1.5 text-xs transition",
                  !search.category
                    ? "border-primary bg-primary/15 text-foreground"
                    : "border-border bg-background/40 text-muted-foreground hover:text-foreground",
                )}
              >
                {t("templates.category.all")}
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => updateSearch({ category: category.name })}
                  className={cn(
                    "min-h-8 rounded-md border px-3 py-1.5 text-xs transition",
                    search.category === category.name
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border bg-background/40 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {templateCategoryLabel(category.name, locale)}
                </button>
              ))}
            </div>

            {showSummary ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">{t("templates.resultCount", { count: totalCount })}</Badge>
                {featuredCount ? (
                  <Badge variant="outline">
                    {t("templates.featuredCount", { count: featuredCount })}
                  </Badge>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <div
        className={cn(
          "min-h-[520px]",
          cardMode === "select" && "min-h-[56vh]",
        )}
      >
        {templatesQ.isLoading ? (
          <section className="rounded-lg border border-border bg-card">
            <LoadingRows />
          </section>
        ) : templates.length ? (
          <>
            <div
              className={cn(
                defaultGridClassName,
                gridClassName,
              )}
            >
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  mode={cardMode}
                  selected={selectedTemplateId === template.id}
                  onSelect={
                    cardMode === "select" && onTemplateSelect
                      ? () => onTemplateSelect(template)
                      : undefined
                  }
                  onOpenDetail={
                    cardMode === "default" ? () => openTemplateDetail(template.id) : undefined
                  }
                  onGenerate={
                    cardMode === "default" ? () => startGenerating(template) : undefined
                  }
                />
              ))}
            </div>
            <div
              ref={loadMoreRef}
              className="flex min-h-10 items-center justify-center text-xs text-muted-foreground"
            >
              {templatesQ.hasNextPage ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void templatesQ.fetchNextPage()}
                  disabled={templatesQ.isFetchingNextPage}
                >
                  {templatesQ.isFetchingNextPage ? t("common.loading") : t("templates.loadMore")}
                </Button>
              ) : templatesQ.isFetchingNextPage ? (
                t("common.loading")
              ) : null}
            </div>
          </>
        ) : (
          <EmptyState title={t("templates.empty.title")} detail={t("templates.empty.detail")} />
        )}
      </div>
    </section>
  );
}

function TemplateCard({
  template,
  mode,
  selected = false,
  onSelect,
  onOpenDetail,
  onGenerate,
}: {
  template: PromptTemplatePublic;
  mode: TemplateCardMode;
  selected?: boolean;
  onSelect?: () => void;
  onOpenDetail?: () => void;
  onGenerate?: () => void;
}) {
  const { locale, t } = useI18n();
  const templateKind = templateMode(template);
  const previewUrl = template.exampleUrl ?? template.referenceUrls[0] ?? "";

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (mode !== "select" || !onSelect) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect();
  };

  const media = previewUrl ? (
    isVideoTemplatePreview(template, previewUrl) ? (
      <video
        src={previewUrl}
        muted
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
      />
    ) : (
      <img
        src={templateCardImageUrl(previewUrl)}
        alt={template.title}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover"
      />
    )
  ) : (
    <div className="flex h-48 items-center justify-center text-muted-foreground">
      <LayoutTemplate className="h-10 w-10" />
    </div>
  );

  const cardClassName = cn(
    "mb-3 inline-flex w-full break-inside-avoid flex-col overflow-hidden rounded-lg border bg-card transition",
    selected
      ? "border-primary shadow-glow"
      : "border-border hover:border-primary/60",
    mode === "select" ? "cursor-pointer" : "",
  );

  return (
    <article
      className={cardClassName}
      role={mode === "select" ? "button" : undefined}
      tabIndex={mode === "select" ? 0 : undefined}
      onClick={mode === "select" ? onSelect : undefined}
      onKeyDown={handleKeyDown}
    >
      {mode === "default" ? (
        <button
          type="button"
          onClick={onOpenDetail}
          className="relative block aspect-[4/3] overflow-hidden bg-secondary/40 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          {media}
          <CardBadges template={template} selected={selected} />
        </button>
      ) : (
        <div className="relative block aspect-[4/3] overflow-hidden bg-secondary/40">
          {media}
          <CardBadges template={template} selected={selected} />
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2.5 p-3">
        <div className="min-w-0">
          <h3 className="line-clamp-1 text-sm font-semibold">
            {mode === "default" ? (
              <button
                type="button"
                onClick={onOpenDetail}
                className="rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              >
                {template.title}
              </button>
            ) : (
              template.title
            )}
          </h3>
          {template.description ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {template.description}
            </p>
          ) : null}
        </div>

        <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
          {template.textPrompt}
        </p>

        {template.referenceUrls.length ? (
          <div className="flex gap-1.5">
            {template.referenceUrls.slice(0, 4).map((url, index) => (
              <img
                key={`${url}-${index}`}
                src={templateCardImageUrl(url)}
                alt={template.referenceAssetKeys[index] ?? template.title}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="h-10 w-10 rounded-md border border-border object-cover"
              />
            ))}
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap gap-1.5">
          {(template.categories?.length
            ? template.categories
            : template.category
              ? [template.category]
              : []
          ).map((category) => (
            <Badge key={category} variant="secondary">
              {templateCategoryLabel(category, locale)}
            </Badge>
          ))}
          {template.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>

        {mode === "default" ? (
          <div className="mt-0.5 grid gap-1.5 sm:grid-cols-2">
            <Button type="button" variant="outline" onClick={onOpenDetail}>
              <LayoutTemplate className="h-4 w-4" />
              {t("templates.detail.view")}
            </Button>
            <Button type="button" className="bg-gradient-primary" onClick={onGenerate}>
              <Wand2 className="h-4 w-4" />
              {t("studio.generate")}
            </Button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function CardBadges({
  template,
  selected,
}: {
  template: PromptTemplatePublic;
  selected: boolean;
}) {
  const { t } = useI18n();
  const kind = templateMode(template);

  return (
    <div className="absolute left-3 right-3 top-3 flex items-start justify-between gap-2">
      <div className="flex flex-wrap gap-1.5">
        <Badge className="gap-1 bg-background/85 text-foreground backdrop-blur">
          {kind === "video" ? <Video className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
          {kind === "video" ? t("studio.mode.video") : t("studio.mode.image")}
        </Badge>
        {template.isFeatured ? (
          <Badge className="bg-primary text-primary-foreground">{t("templates.featured")}</Badge>
        ) : null}
        {kind === "video" ? (
          <Badge className="gap-1 bg-primary text-primary-foreground">
            <Crown className="h-3 w-3" />
            {t("dashboard.advancedAccess")}
          </Badge>
        ) : null}
      </div>
      {selected ? (
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow">
          <Check className="h-4 w-4" />
        </span>
      ) : null}
    </div>
  );
}

function isVideoTemplatePreview(template: PromptTemplatePublic, url: string) {
  return template.type === "IMAGE2VIDEO" && /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
}
