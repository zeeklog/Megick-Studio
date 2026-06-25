import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Edit3, Plus, Trash2 } from "lucide-react";
import type { PromptTemplateCategoryPublic } from "@megick/api-types";
import { AdminTable, useAdminClientPagination, type Column } from "@/components/admin/AdminTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiDelete, apiGet, apiPost } from "@/lib/api-client";
import { useAdminI18n } from "@/lib/admin-i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/template-categories")({
  component: AdminTemplateCategories,
});

type CategoryForm = {
  id?: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

const emptyForm = (): CategoryForm => ({
  name: "",
  sortOrder: 0,
  isActive: true,
});

const formFromCategory = (item: PromptTemplateCategoryPublic): CategoryForm => ({
  id: item.id,
  name: item.name,
  sortOrder: item.sortOrder,
  isActive: item.isActive,
});

function AdminTemplateCategories() {
  const { t, formatDateTime } = useAdminI18n();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CategoryForm | null>(null);

  const categoriesQ = useQuery({
    queryKey: ["admin", "template-categories"],
    queryFn: () => apiGet<PromptTemplateCategoryPublic[]>("/api/admin/templates/categories"),
  });

  const upsert = useMutation({
    mutationFn: (form: CategoryForm) => apiPost("/api/admin/templates/categories", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "template-categories"] });
      queryClient.invalidateQueries({ queryKey: ["templates", "categories"] });
      setEditing(null);
      toast.success(t("page.templateCategories.saved"));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/templates/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "template-categories"] });
      queryClient.invalidateQueries({ queryKey: ["templates", "categories"] });
      toast.success(t("page.templateCategories.deleted"));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const rows = categoriesQ.data ?? [];
  const table = useAdminClientPagination(rows, { initialPageSize: 25 });

  const columns: Column<PromptTemplateCategoryPublic>[] = [
    {
      header: t("common.name"),
      cell: (item) => <span className="font-medium">{item.name}</span>,
    },
    {
      header: t("common.status"),
      cell: (item) => (
        <Badge variant={item.isActive ? "default" : "secondary"}>
          {item.isActive ? t("common.active") : t("common.inactive")}
        </Badge>
      ),
    },
    { header: t("common.sort"), cell: (item) => item.sortOrder },
    { header: t("common.created"), cell: (item) => formatDateTime(item.createdAt) },
    { header: t("common.updated"), cell: (item) => formatDateTime(item.updatedAt) },
    {
      header: "",
      cell: (item) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(formFromCategory(item))}>
            <Edit3 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() =>
              window.confirm(t("page.templateCategories.deleteConfirm")) &&
              remove.mutate(item.id)
            }
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("page.templateCategories.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("page.templateCategories.description")}
          </p>
        </div>
        <Button onClick={() => setEditing(emptyForm())}>
          <Plus className="mr-1.5 h-4 w-4" />
          {t("page.templateCategories.new")}
        </Button>
      </header>

      <AdminTable
        rows={table.rows}
        columns={columns}
        loading={categoriesQ.isLoading}
        empty={t("page.templateCategories.empty")}
        rowKey={(item) => item.id}
        pagination={table.pagination}
      />

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogTitle>
            {editing?.id ? t("page.templateCategories.editTitle") : t("page.templateCategories.newTitle")}
          </DialogTitle>
          {editing ? (
            <CategoryEditor
              value={editing}
              onChange={setEditing}
              onCancel={() => setEditing(null)}
              onSave={() => upsert.mutate(editing)}
              saving={upsert.isPending}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryEditor({
  value,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  value: CategoryForm;
  onChange: (value: CategoryForm) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const { t } = useAdminI18n();
  const patch = (next: Partial<CategoryForm>) => onChange({ ...value, ...next });

  return (
    <div className="grid gap-4">
      <Field label={t("common.name")}>
        <Input
          value={value.name}
          onChange={(event) => patch({ name: event.target.value })}
          placeholder={t("page.templateCategories.namePlaceholder")}
        />
      </Field>
      <Field label={t("common.sort")}>
        <Input
          type="number"
          value={value.sortOrder}
          onChange={(event) => patch({ sortOrder: Number(event.target.value) || 0 })}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.isActive}
          onChange={(event) => patch({ isActive: event.target.checked })}
        />
        {t("common.active")}
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button onClick={onSave} disabled={saving}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
