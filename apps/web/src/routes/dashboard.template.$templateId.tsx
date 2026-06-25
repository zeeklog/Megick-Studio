import { createFileRoute } from "@tanstack/react-router";
import { getInitialLocale, translate } from "@/lib/i18n";
import { noIndexHead } from "@/lib/seo";
import { TemplateDetailPage } from "./dashboard.templates.$templateId";

export const Route = createFileRoute("/dashboard/template/$templateId")({
  head: () =>
    noIndexHead({
      title: translate(getInitialLocale(), "templates.detail.meta.title"),
      description: translate(getInitialLocale(), "templates.detail.meta.description"),
    }),
  component: DashboardTemplateDetailRoute,
});

function DashboardTemplateDetailRoute() {
  const { templateId } = Route.useParams();
  return <TemplateDetailPage templateId={templateId} listPath="/dashboard/template" />;
}
