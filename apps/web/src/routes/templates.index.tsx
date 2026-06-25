import { createFileRoute } from "@tanstack/react-router";
import { SiteLayout } from "@/components/SiteLayout";
import { TemplateCenterPage } from "./dashboard.templates.index";
import { useI18n } from "@/lib/i18n";
import type { PublicTemplateSearch } from "./templates";

export const Route = createFileRoute("/templates/")({
  component: PublicTemplatesPage,
});

function PublicTemplatesPage() {
  const { t } = useI18n();
  const search = Route.useSearch() as PublicTemplateSearch;
  const loaderData = Route.useLoaderData() as {
    categories: any[];
    templates: any;
  } | undefined;

  return (
    <SiteLayout>
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* Page header */}
        <section
          className="mb-6 rounded-xl border p-5 sm:p-6"
          style={{
            borderColor: "var(--glass-border)",
            backgroundColor: "var(--glass-bg)",
          }}
        >
          <div className="max-w-2xl space-y-2">
            <h1
              className="text-2xl font-bold tracking-tight sm:text-3xl"
              style={{ color: "var(--theme-text)" }}
            >
              {t("templates.title")}
            </h1>
            <p className="text-sm" style={{ color: "var(--theme-text-muted)" }}>
              {t("templates.description")}
            </p>
          </div>
        </section>

        <TemplateCenterPage
          search={search}
          basePath="/templates"
          initialCategories={loaderData?.categories}
          initialTemplatesPage={loaderData?.templates}
          showControls
          showSummary
        />
      </div>
    </SiteLayout>
  );
}
