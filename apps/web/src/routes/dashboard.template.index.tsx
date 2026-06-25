import { createFileRoute } from "@tanstack/react-router";
import { getInitialLocale, translate } from "@/lib/i18n";
import { noIndexHead } from "@/lib/seo";
import {
  TemplateCenterPage,
  templateSearchSchema,
} from "./dashboard.templates.index";

export const Route = createFileRoute("/dashboard/template/")({
  head: () =>
    noIndexHead({
      title: translate(getInitialLocale(), "templates.meta.title"),
      description: translate(getInitialLocale(), "templates.meta.description"),
    }),
  validateSearch: templateSearchSchema,
  component: DashboardTemplateIndexRoute,
});

function DashboardTemplateIndexRoute() {
  return <TemplateCenterPage search={Route.useSearch()} basePath="/dashboard/template" />;
}
