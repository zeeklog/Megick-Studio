import type { TemplateSearch } from "@/routes/dashboard.templates.index";
import { TemplateCenterPage } from "@/routes/dashboard.templates.index";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { PromptTemplatePublic } from "@megick/api-types";

export function TemplateCenterDialog({
  open,
  onOpenChange,
  title,
  search,
  onTemplateSelect,
  onSearchChange,
  initialVideoGenerationEnabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  search: TemplateSearch;
  onTemplateSelect: (template: PromptTemplatePublic) => void;
  onSearchChange: (search: TemplateSearch) => void;
  initialVideoGenerationEnabled: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] max-w-4xl overflow-y-auto">
        <DialogTitle>{title}</DialogTitle>
        <TemplateCenterPage
          search={search}
          basePath="/dashboard/template"
          cardMode="select"
          onTemplateSelect={onTemplateSelect}
          onSearchChange={onSearchChange}
          initialVideoGenerationEnabled={initialVideoGenerationEnabled}
          className="pt-2"
        />
      </DialogContent>
    </Dialog>
  );
}
