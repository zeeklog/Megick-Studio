import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowRight, CheckCircle2, Gauge, ImageIcon, WalletCards } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { apiGet } from "@/lib/api-client";
import { type DashboardOverview } from "./-dashboard-types";
import type { GenerationJobPublic } from "@megick/api-types";
import { MetricCard, JobMiniRow, EmptyState } from "./-dashboard-components";
import { getInitialLocale, translate, useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/dashboard/overview")({
  head: () => ({
    meta: [
      { title: translate(getInitialLocale(), "overview.meta.title") },
      { name: "description", content: translate(getInitialLocale(), "overview.meta.description") },
    ],
  }),
  component: OverviewRoute,
});

function OverviewRoute() {
  const { t } = useI18n();
  const { user } = useAuth();

  const overviewQ = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: () => apiGet<DashboardOverview>("/api/users/me/overview"),
    enabled: !!user,
  });

  const jobsQ = useQuery({
    queryKey: ["dashboard", "jobs"],
    queryFn: () =>
      apiGet<GenerationJobPublic[]>("/api/generation/jobs", { query: { mine: true, limit: 24 } }),
    enabled: !!user,
  });

  const overview = overviewQ.data;
  const credits = user?.credits ?? overview?.credits ?? 0;
  const recentJobs = jobsQ.data ?? [];

  const generationMix = useMemo(() => {
    const succeeded = recentJobs.filter((job) => job.status === "succeeded").length;
    const running = recentJobs.filter(
      (job) => job.status === "running" || job.status === "queued",
    ).length;
    const failed = recentJobs.filter((job) => job.status === "failed").length;
    return { succeeded, running, failed };
  }, [recentJobs]);

  return (
    <OverviewPanel
      credits={credits}
      overview={overview}
      jobs={recentJobs}
      generationMix={generationMix}
    />
  );
}

function OverviewPanel({
  credits,
  overview,
  jobs,
  generationMix,
}: {
  credits: number;
  overview?: DashboardOverview;
  jobs: GenerationJobPublic[];
  generationMix: { succeeded: number; running: number; failed: number };
}) {
  const { t, formatNumber } = useI18n();
  const totalSpent = overview?.totalSpent ?? 0;

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={WalletCards}
          label={t("overview.metric.credits")}
          value={formatNumber(credits)}
          detail={t("overview.metric.creditsManagedByAdmin")}
        />
        <MetricCard
          icon={ImageIcon}
          label={t("overview.metric.generations")}
          value={formatNumber(overview?.totalGenerations ?? jobs.length)}
          detail={t("overview.metric.generationDetail", {
            succeeded: formatNumber(generationMix.succeeded),
            running: formatNumber(generationMix.running),
          })}
        />
        <MetricCard
          icon={CheckCircle2}
          label={t("overview.metric.successRate")}
          value={`${overview?.successRate ?? 0}%`}
          detail={
            generationMix.failed > 0
              ? t("overview.metric.failedDetail", { failed: formatNumber(generationMix.failed) })
              : t("overview.metric.noFailed")
          }
        />
        <MetricCard
          icon={Gauge}
          label={t("overview.metric.creditUsage")}
          value={formatNumber(totalSpent)}
          detail={t("overview.metric.planManagedByAdmin")}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
        <section className="rounded-lg border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{t("overview.operations.title")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("overview.operations.description")}
              </p>
            </div>
            <Button asChild className="bg-gradient-primary">
              <Link to="/dashboard/studio/image">
                {t("overview.startCreating")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="rounded-lg border border-border bg-background/35 p-4 lg:col-span-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{t("overview.reserve")}</span>
                <span className="text-muted-foreground">
                  {t("overview.reserveOpenSourceDetail", { credits: formatNumber(credits) })}
                </span>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  [t("overview.mix.succeeded"), generationMix.succeeded],
                  [t("overview.mix.running"), generationMix.running],
                  [t("overview.mix.failed"), generationMix.failed],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border border-border bg-secondary/20 p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-2 text-xl font-semibold">{formatNumber(Number(value))}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background/35 p-4">
              <p className="text-sm font-medium">{t("overview.next.title")}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("overview.next.openSourceDescription")}
              </p>
              <Button asChild variant="outline" className="mt-4 w-full">
                <Link to="/dashboard/studio/image">
                  {t("overview.startCreating")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">{t("overview.recent")}</h2>
          <div className="mt-4 flex flex-col gap-3">
            {jobs.slice(0, 5).length ? (
              jobs.slice(0, 5).map((job) => <JobMiniRow key={job.id} job={job} />)
            ) : (
              <EmptyState title={t("overview.empty.title")} detail={t("overview.empty.detail")} />
            )}
          </div>
        </section>
      </div>
    </>
  );
}
