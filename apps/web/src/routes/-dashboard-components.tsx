import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { GenerationJobPublic } from "@megick/api-types";
import { studioPathForJob, studioSearchForJob } from "./-dashboard-types";
import { LayoutDashboard } from "lucide-react";
import { localeToIntl, useI18n, type AppLocale, type TranslationKey } from "@/lib/i18n";

export function PanelHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start justify-between gap-4 border-b border-border p-4 sm:flex-row sm:p-5">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action ? (
        <div className="flex w-full shrink-0 sm:w-auto [&>*]:w-full sm:[&>*]:w-auto">
          {action}
        </div>
      ) : null}
    </div>
  );
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof LayoutDashboard;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
      <p className="mt-4 truncate text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export function JobMiniRow({ job }: { job: GenerationJobPublic }) {
  const { locale } = useI18n();

  return (
    <Link
      to={job.chatSessionId ? studioPathForJob(job) : "/dashboard/jobs/$jobId"}
      params={job.chatSessionId ? undefined : { jobId: job.id }}
      search={studioSearchForJob(job)}
      className="rounded-lg border border-border bg-background/35 p-3 transition hover:bg-secondary/30"
    >
      <div className="flex items-center justify-between gap-3">
        <StatusBadge status={job.status} />
        <span className="text-xs text-muted-foreground">{formatDateTime(job.createdAt, locale)}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-sm">{job.prompt}</p>
    </Link>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-background/25 p-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

export function LoadingRows() {
  return (
    <div className="flex flex-col gap-3 p-5">
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-14 rounded-lg bg-secondary/40" />
      ))}
    </div>
  );
}

export function TemplateDetailSkeleton() {
  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_360px]">
        <article className="overflow-hidden rounded-lg border border-border bg-card">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />

          <div className="space-y-5 p-5">
            <Skeleton className="h-8 w-40" />

            <div className="space-y-3">
              <Skeleton className="h-8 w-2/3 max-w-xl" />
              <Skeleton className="h-4 w-full max-w-3xl" />
              <Skeleton className="h-4 w-5/6 max-w-2xl" />
              <Skeleton className="h-4 w-1/2 max-w-sm" />
            </div>

            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3].map((item) => (
                <Skeleton key={item} className="h-6 w-20 rounded-full" />
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="rounded-lg border border-border bg-background/35 p-4"
                >
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="mt-3 h-4 w-24" />
                </div>
              ))}
            </div>
          </div>
        </article>

        <aside className="space-y-5">
          {[0, 1].map((section) => (
            <section key={section} className="rounded-lg border border-border bg-card p-5">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="mt-3 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-4/5" />

              <div className="mt-5 grid gap-3">
                {[0, 1, 2, 3].map((item) => (
                  <Skeleton key={item} className="h-10 w-full rounded-md" />
                ))}
              </div>
            </section>
          ))}
        </aside>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        {[0, 1].map((section) => (
          <section key={section} className="rounded-lg border border-border bg-card p-5">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="mt-3 h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-2/3" />

            <div className="mt-5 grid gap-4">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="rounded-lg border border-border bg-background/35 p-4"
                >
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="mt-3 h-4 w-full" />
                  <Skeleton className="mt-2 h-4 w-5/6" />
                  <Skeleton className="mt-2 h-4 w-3/5" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </section>

      <section className="rounded-lg border border-border bg-card p-5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-3 h-4 w-full" />
        <Skeleton className="mt-2 h-4 w-3/4" />

        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="aspect-[4/3] w-full rounded-lg" />
          ))}
        </div>
      </section>
    </section>
  );
}

export function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/35 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 truncate text-sm font-medium">{value}</p>
    </div>
  );
}

export function StatusBadge({ status }: { status: GenerationJobPublic["status"] }) {
  const { t } = useI18n();
  const variant = status === "failed" ? "destructive" : status === "succeeded" ? "default" : "secondary";
  return <Badge variant={variant}>{t(`common.status.${status}` as TranslationKey)}</Badge>;
}

export function formatDate(value: string, locale?: AppLocale) {
  return new Date(value).toLocaleDateString(locale ? localeToIntl(locale) : undefined);
}

export function formatDateTime(value: string, locale?: AppLocale) {
  return new Date(value).toLocaleString(locale ? localeToIntl(locale) : undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(value: number, locale?: AppLocale) {
  return new Date(value).toLocaleTimeString(locale ? localeToIntl(locale) : undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}
