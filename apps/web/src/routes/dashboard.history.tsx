import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { getInitialLocale, translate } from "@/lib/i18n";
import { asSearchRecord, optionalEnum, optionalString } from "@/lib/search-params";
import type { HistorySearch, HistoryTypeFilter } from "./-dashboard-history-page";

const HISTORY_TYPE_FILTERS = ["all", "TEXT2IMAGE", "IMAGE2VIDEO", "IMAGE_EDIT"] as const;

const HistoryPage = lazy(() =>
  import("./-dashboard-history-page").then((module) => ({ default: module.HistoryPage })),
);

function historySearchSchema(input: unknown): HistorySearch {
  const search = asSearchRecord(input);
  return {
    prompt: optionalString(search.prompt),
    status: optionalString(search.status),
    type: optionalEnum(search.type, HISTORY_TYPE_FILTERS) as HistoryTypeFilter | undefined,
    jobId: optionalString(search.jobId),
  };
}

export const Route = createFileRoute("/dashboard/history")({
  head: () => ({
    meta: [
      { title: translate(getInitialLocale(), "history.meta.title") },
      { name: "description", content: translate(getInitialLocale(), "history.meta.description") },
    ],
  }),
  validateSearch: historySearchSchema,
  component: HistoryRoute,
});

function HistoryRoute() {
  return (
    <Suspense fallback={<HistoryRouteLoading />}>
      <HistoryPage search={Route.useSearch()} />
    </Suspense>
  );
}

function HistoryRouteLoading() {
  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-border bg-card">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  );
}
