import { createFileRoute, Outlet } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { getInitialLocale, translate } from "@/lib/i18n";
import { noIndexHead } from "@/lib/seo";

const DashboardShell = lazy(() =>
  import("./-dashboard-shell").then((module) => ({ default: module.DashboardShell })),
);

export const Route = createFileRoute("/dashboard")({
  head: () =>
    noIndexHead({
      title: translate(getInitialLocale(), "dashboard.meta.title"),
      description: translate(getInitialLocale(), "dashboard.meta.description"),
    }),
  component: DashboardLayoutRoute,
});

function DashboardLayoutRoute() {
  return (
    <Suspense fallback={<DashboardRouteLoading />}>
      <DashboardShell>
        <Outlet />
      </DashboardShell>
    </Suspense>
  );
}

function DashboardRouteLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  );
}
