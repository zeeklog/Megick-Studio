import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/template")({
  component: DashboardTemplateLayoutRoute,
});

function DashboardTemplateLayoutRoute() {
  return <Outlet />;
}
