import { createFileRoute } from "@tanstack/react-router";
import { PromptTemplateAdminPage } from "@/components/admin/PromptTemplateAdminPage";
import { useAdminI18n } from "@/lib/admin-i18n";

export const Route = createFileRoute("/admin/image-templates")({
  component: AdminImageTemplates,
});

function AdminImageTemplates() {
  const { t } = useAdminI18n();
  return (
    <PromptTemplateAdminPage
      type="TEXT2IMAGE"
      title={t("page.templates.imageTitle")}
      description={t("page.templates.imageDescription")}
    />
  );
}
