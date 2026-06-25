import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/templates")({
  component: TemplatesLayoutRoute,
});

function TemplatesLayoutRoute() {
  return <Outlet />;
}
