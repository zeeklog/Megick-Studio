import { createFileRoute, Outlet } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { apiGet } from "@/lib/api-client";
import { getInitialLocale, translate } from "@/lib/i18n";
import { asSearchRecord, optionalEnum, optionalString } from "@/lib/search-params";
import { seoHead } from "@/lib/seo";

const TEMPLATE_TYPES = ["all", "image", "video"] as const;

export type PublicTemplateSearch = {
  q?: string;
  category?: string;
  type?: (typeof TEMPLATE_TYPES)[number];
};

export function templateSearchSchema(input: unknown): PublicTemplateSearch {
  const search = asSearchRecord(input);
  return {
    q: optionalString(search.q),
    category: optionalString(search.category),
    type: optionalEnum(search.type, TEMPLATE_TYPES),
  };
}

const fetchInitialTemplatesData = createServerFn({ method: "GET" }).handler(async () => {
  const [templates, categories] = await Promise.all([
    apiGet<any>("/api/templates?compact=true&page=1&pageSize=20", {
      forwardServerCookies: true,
    }),
    apiGet<any[]>("/api/templates/categories", {
      forwardServerCookies: true,
    }),
  ]);
  return { templates, categories };
});

export const Route = createFileRoute("/templates")({
  loader: () => fetchInitialTemplatesData(),
  head: () => {
    const locale = getInitialLocale();
    return seoHead({
      title: translate(locale, "templates.meta.title"),
      description: translate(locale, "templates.meta.description"),
      path: "/templates",
      locale,
    });
  },
  validateSearch: templateSearchSchema,
  component: TemplatesLayoutRoute,
});

function TemplatesLayoutRoute() {
  return <Outlet />;
}
