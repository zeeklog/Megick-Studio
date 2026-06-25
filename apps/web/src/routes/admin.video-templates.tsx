import { createFileRoute } from "@tanstack/react-router";
import { PromptTemplateAdminPage } from "@/components/admin/PromptTemplateAdminPage";
import { useAdminI18n } from "@/lib/admin-i18n";

export const Route = createFileRoute("/admin/video-templates")({
  component: AdminVideoTemplates,
});

function AdminVideoTemplates() {
  const { t } = useAdminI18n();
  return (
    <PromptTemplateAdminPage
      type="IMAGE2VIDEO"
      title={t("page.templates.videoTitle")}
      description={t("page.templates.videoDescription")}
    />
  );
}
