import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Crown,
  History,
  Image as ImageIcon,
  LayoutTemplate,
  Sparkles,
  Video,
  Wand2,
} from "lucide-react";
import type { PromptTemplatePublic } from "@megick/api-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useAuth } from "@/hooks/useAuth";
import { apiGet } from "@/lib/api-client";
import { useVideoGenerationEnabled } from "@/lib/feature-flags";
import { getInitialLocale, styleLabelKey, translate, useI18n } from "@/lib/i18n";
import { noIndexHead } from "@/lib/seo";
import { templateCategoryLabel } from "@/lib/template-categories";
import { templateDetailImageUrl, templateReferencePreviewUrl } from "@/lib/template-images";
import { ratioToSize, STYLE_PRESETS } from "@/components/studio/presets";
import { ZoomableImage } from "@/components/ZoomableImage";
import { EmptyState, TemplateDetailSkeleton } from "./-dashboard-components";
import { studioPathForMode } from "./-dashboard-types";

export const Route = createFileRoute("/dashboard/templates/$templateId")({
  head: () =>
    noIndexHead({
      title: translate(getInitialLocale(), "templates.detail.meta.title"),
      description: translate(getInitialLocale(), "templates.detail.meta.description"),
    }),
  component: TemplateDetailRoute,
});

function TemplateDetailRoute() {
  const { templateId } = Route.useParams();
  return <TemplateDetailPage templateId={templateId} listPath="/dashboard/templates" />;
}

export function TemplateDetailPage({
  templateId,
  listPath,
}: {
  templateId: string;
  listPath: "/dashboard/template" | "/dashboard/templates";
}) {
  const { user } = useAuth();
  const { locale, t, formatDateTime, formatNumber } = useI18n();
  const { videoGenerationEnabled, isLoading: videoFlagLoading } = useVideoGenerationEnabled();
  const templateQ = useQuery({
    queryKey: ["templates", "detail", templateId],
    queryFn: () => apiGet<PromptTemplatePublic>(`/api/templates/${templateId}`),
    enabled: !!user,
  });

  const template = templateQ.data;

  const mode = template ? templateMode(template) : "image";
  const categories = useMemo(() => (template ? templateCategories(template) : []), [template]);
  const previewUrl = template ? (template.exampleUrl ?? template.referenceUrls[0] ?? "") : "";
  const references = useMemo(() => {
    if (!template) return [];
    const urls = [template.exampleUrl, ...template.referenceUrls].filter((value): value is string =>
      Boolean(value),
    );
    return Array.from(new Set(urls));
  }, [template]);
  const params = useMemo(() => asPlainRecord(template?.params), [template?.params]);
  const templateSettings = useMemo(() => asPlainRecord(params.settings), [params]);

  const style = typeof templateSettings.style === "string" ? templateSettings.style : null;
  const ratio =
    typeof templateSettings.ratio === "string"
      ? templateSettings.ratio
      : typeof params.ratio === "string"
        ? params.ratio
        : typeof params.aspect_ratio === "string"
          ? params.aspect_ratio
          : null;
  const count =
    typeof templateSettings.count === "number"
      ? templateSettings.count
      : typeof params.n === "number"
        ? params.n
        : null;
  const seed =
    typeof templateSettings.seed === "number"
      ? templateSettings.seed
      : typeof params.seed === "number"
        ? params.seed
        : null;
  const negative =
    typeof templateSettings.negative === "string" ? templateSettings.negative.trim() : "";
  const model =
    template?.modelCode ||
    (typeof templateSettings.model === "string" ? templateSettings.model : "");

  const studioPrompt = template
    ? [
        template.textPrompt,
        template.materialPrompt
          ? t("templates.detail.materialPromptLine", { material: template.materialPrompt })
          : "",
      ]
        .filter(Boolean)
        .join("\n\n")
    : "";

  const generationDisabled = mode === "video" && (videoFlagLoading || !videoGenerationEnabled);
  const styleLabel =
    style && STYLE_PRESETS.some((preset) => preset.id === style)
      ? t(styleLabelKey(style))
      : style || "";
  const ratioLabel = ratio ? `${ratio} · ${ratioToSize(ratio)}` : "";
  const rawParamsJson = useMemo(
    () => JSON.stringify(template?.params ?? {}, null, 2),
    [template?.params],
  );

  const summaryItems = [
    {
      label: t("common.type"),
      value: mode === "video" ? t("studio.mode.video") : t("studio.mode.image"),
    },
    { label: t("studio.style"), value: styleLabel || t("templates.detail.notSet") },
    { label: t("studio.composer.ratio"), value: ratioLabel || t("templates.detail.notSet") },
    {
      label: t("studio.count"),
      value: count != null ? formatNumber(count) : t("templates.detail.notSet"),
    },
    {
      label: t("studio.seed"),
      value: seed != null ? formatNumber(seed) : t("templates.detail.notSet"),
    },
    { label: t("studio.model"), value: model || t("templates.detail.notSet") },
    { label: t("studio.negativePrompt"), value: negative || t("templates.detail.notSet") },
  ];

  const statItems = template
    ? [
        { label: t("templates.detail.usageCount"), value: formatNumber(template.usageCount) },
        { label: t("templates.detail.referenceCount"), value: formatNumber(references.length) },
        { label: t("templates.detail.updatedAt"), value: formatDateTime(template.updatedAt) },
        {
          label: template.publishedAt ? t("templates.detail.publishedAt") : t("common.created"),
          value: formatDateTime(template.publishedAt ?? template.createdAt),
        },
      ]
    : [];

  return (
    <section className="space-y-5">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to={listPath}>{t("templates.title")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{template?.title ?? t("templates.detail.view")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {templateQ.isLoading ? (
        <TemplateDetailSkeleton />
      ) : !template ? (
        <EmptyState title={t("templates.loadFailed")} detail={t("templates.empty.detail")} />
      ) : (
        <>
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_360px]">
            <article className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="relative bg-secondary/35">
                {previewUrl ? (
                  isVideoTemplatePreview(template, previewUrl) ? (
                    <video
                      src={previewUrl}
                      controls
                      playsInline
                      preload="metadata"
                      className="aspect-[4/3] w-full object-cover"
                    />
                  ) : (
                    <ZoomableImage
                      src={templateDetailImageUrl(previewUrl)}
                      alt={template.title}
                      referrerPolicy="no-referrer"
                      className="m-0 aspect-[4/3] max-h-[640px] w-full rounded-none border-0 bg-black object-contain shadow-none"
                    />
                  )
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center text-muted-foreground">
                    <LayoutTemplate className="h-12 w-12" />
                  </div>
                )}
                <div className="absolute left-4 top-4 flex flex-wrap gap-2">
                  <Badge className="gap-1 bg-background/90 text-foreground backdrop-blur">
                    {mode === "video" ? (
                      <Video className="h-3 w-3" />
                    ) : (
                      <ImageIcon className="h-3 w-3" />
                    )}
                    {mode === "video" ? t("studio.mode.video") : t("studio.mode.image")}
                  </Badge>
                  {template.isFeatured ? (
                    <Badge className="bg-primary text-primary-foreground">
                      {t("templates.featured")}
                    </Badge>
                  ) : null}
                  {mode === "video" ? (
                    <Badge className="gap-1 bg-primary text-primary-foreground">
                      <Crown className="h-3 w-3" />
                      {t("dashboard.advancedAccess")}
                    </Badge>
                  ) : null}
                </div>
              </div>

              <div className="space-y-5 p-5">
                <div className="space-y-3">
                  <Button asChild variant="ghost" className="-ml-2 h-8 px-2 text-muted-foreground">
                    <Link to={listPath}>
                      <ArrowLeft className="h-4 w-4" />
                      {t("templates.detail.back")}
                    </Link>
                  </Button>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <h1 className="text-2xl font-semibold tracking-tight">{template.title}</h1>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                          {template.description || t("templates.detail.descriptionFallback")}
                        </p>
                      </div>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      {t("templates.detail.modeHint", {
                        mode: mode === "video" ? t("studio.mode.video") : t("studio.mode.image"),
                      })}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {categories.map((category) => (
                      <Badge key={category} variant="secondary">
                        {templateCategoryLabel(category, locale)}
                      </Badge>
                    ))}
                    {template.tags.map((tag) => (
                      <Badge key={tag} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {statItems.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-lg border border-border bg-background/35 p-4"
                    >
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="mt-2 text-sm font-medium">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </article>

            <aside className="space-y-5">
              <section className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles className="h-4 w-4 text-primary" />
                  {t("templates.detail.actions.title")}
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t("templates.detail.actions.description")}
                </p>

                <div className="mt-5 grid gap-3">
                  {generationDisabled ? (
                    <Button disabled className="w-full bg-gradient-primary">
                      <Wand2 className="h-4 w-4" />
                      {t("studio.generate")}
                    </Button>
                  ) : (
                    <Button asChild className="w-full bg-gradient-primary">
                      <Link to={studioPathForMode(mode)} search={{ templateId: template.id }}>
                        <Wand2 className="h-4 w-4" />
                        {t("studio.generate")}
                      </Link>
                    </Button>
                  )}

                  <Button asChild variant="outline" className="w-full">
                    <Link to={studioPathForMode(mode)}>
                      <LayoutTemplate className="h-4 w-4" />
                      {t("templates.detail.startBlank")}
                    </Link>
                  </Button>

                  <Button asChild variant="outline" className="w-full">
                    <Link to="/dashboard/history">
                      <History className="h-4 w-4" />
                      {t("templates.detail.openHistory")}
                    </Link>
                  </Button>

                  <Button asChild variant="outline" className="w-full">
                    <Link
                      to={listPath}
                      search={{
                        category: categories[0] || undefined,
                        type: mode,
                      }}
                    >
                      <LayoutTemplate className="h-4 w-4" />
                      {t("templates.detail.moreLikeThis")}
                    </Link>
                  </Button>
                </div>

                {generationDisabled ? (
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">
                    {t("studio.videoUnavailableDesc")}
                  </p>
                ) : null}
              </section>

              <section className="rounded-lg border border-border bg-card p-5">
                <h2 className="text-base font-semibold">{t("templates.detail.summary.title")}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t("templates.detail.summary.description")}
                </p>

                <dl className="mt-5 grid gap-3">
                  {summaryItems.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-lg border border-border bg-background/35 p-4"
                    >
                      <dt className="text-xs text-muted-foreground">{item.label}</dt>
                      <dd className="mt-2 whitespace-pre-wrap break-words text-sm font-medium leading-6">
                        {item.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            </aside>
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-base font-semibold">{t("templates.detail.prompts.title")}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("templates.detail.prompts.description")}
              </p>

              <div className="mt-5 grid gap-4">
                <PromptBlock
                  title={t("templates.detail.textPrompt")}
                  content={template.textPrompt}
                />
                <PromptBlock
                  title={t("templates.detail.materialPrompt")}
                  content={
                    template.materialPrompt?.trim() || t("templates.detail.materialFallback")
                  }
                  muted={!template.materialPrompt?.trim()}
                />
                <PromptBlock title={t("templates.detail.studioPrompt")} content={studioPrompt} />
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-base font-semibold">{t("templates.detail.rawParams.title")}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {t("templates.detail.rawParams.description")}
              </p>

              <pre className="mt-5 overflow-x-auto rounded-lg border border-border bg-background/35 p-4 text-xs leading-6 text-muted-foreground">
                {rawParamsJson}
              </pre>
            </section>
          </section>

          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="text-base font-semibold">{t("templates.detail.references.title")}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {t("templates.detail.references.description")}
            </p>

            {references.length ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {references.map((url, index) => (
                  <div
                    key={`${url}-${index}`}
                    className="overflow-hidden rounded-lg border border-border bg-background/35"
                  >
                    {isVideoUrl(url) ? (
                      <video
                        src={url}
                        controls
                        muted
                        playsInline
                        preload="metadata"
                        className="aspect-[4/3] w-full object-cover"
                      />
                    ) : (
                      <ZoomableImage
                        src={templateReferencePreviewUrl(url)}
                        alt={template.referenceAssetKeys[index] ?? template.title}
                        referrerPolicy="no-referrer"
                        className="m-0 aspect-[4/3] w-full rounded-none border-0 bg-black object-contain shadow-none"
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-lg border border-dashed border-border bg-background/25 p-6 text-sm text-muted-foreground">
                {t("templates.detail.noReferences")}
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}

function PromptBlock({
  title,
  content,
  muted = false,
}: {
  title: string;
  content: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/35 p-4">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <p
        className={`mt-3 whitespace-pre-wrap break-words text-sm leading-6 ${muted ? "text-muted-foreground" : ""}`}
      >
        {content}
      </p>
    </div>
  );
}

function asPlainRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function templateMode(template: PromptTemplatePublic) {
  return template.type === "IMAGE2VIDEO" ? "video" : "image";
}

function templateCategories(template: PromptTemplatePublic) {
  return Array.from(
    new Set(
      [...(template.categories?.filter(Boolean) ?? []), template.category?.trim() ?? ""].filter(
        Boolean,
      ),
    ),
  );
}

function isVideoTemplatePreview(template: PromptTemplatePublic, url: string) {
  return template.type === "IMAGE2VIDEO" && isVideoUrl(url);
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
}
