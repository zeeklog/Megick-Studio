import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AdminTable, useAdminClientPagination, type Column } from "@/components/admin/AdminTable";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiDelete, apiGet, apiPost } from "@/lib/api-client";
import { useAdminI18n } from "@/lib/admin-i18n";
import type {
  NavigationMenuArea,
  NavigationMenuItem,
  NavigationMenuMetadata,
} from "@/lib/navigation-menus";

export const Route = createFileRoute("/admin/navigation-menus")({
  component: AdminNavigationMenus,
});

type NavigationMenuForm = NavigationMenuItem & {
  metadataText: string;
};

const menuAreas: NavigationMenuArea[] = ["HEADER", "DASHBOARD_SIDEBAR"];

const empty = (): NavigationMenuForm => ({
  id: "",
  area: "HEADER",
  code: "",
  label: "",
  labelEn: "",
  description: "",
  descriptionEn: "",
  href: "",
  icon: "",
  requiresAuth: false,
  isActive: true,
  sortOrder: 0,
  metadata: null,
  metadataText: "",
});

function formFromRow(row: NavigationMenuItem): NavigationMenuForm {
  return {
    ...row,
    labelEn: row.labelEn ?? "",
    description: row.description ?? "",
    descriptionEn: row.descriptionEn ?? "",
    icon: row.icon ?? "",
    metadata: row.metadata ?? null,
    metadataText: row.metadata ? JSON.stringify(row.metadata, null, 2) : "",
  };
}

function parseMetadata(text: string): NavigationMenuMetadata | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Metadata must be a JSON object");
  }
  return parsed as NavigationMenuMetadata;
}

function AdminNavigationMenus() {
  const { t } = useAdminI18n();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<NavigationMenuForm | null>(null);
  const [area, setArea] = useState<NavigationMenuArea | "ALL">("ALL");

  const itemsQ = useQuery({
    queryKey: ["admin", "navigation-menus"],
    queryFn: () => apiGet<NavigationMenuItem[]>("/api/admin/navigation-menus"),
  });

  const rows = useMemo(() => {
    const items = itemsQ.data ?? [];
    return area === "ALL" ? items : items.filter((item) => item.area === area);
  }, [area, itemsQ.data]);
  const table = useAdminClientPagination(rows);

  const upsert = useMutation({
    mutationFn: (input: NavigationMenuForm) => {
      const metadata = parseMetadata(input.metadataText);
      return apiPost("/api/admin/navigation-menus", {
        id: input.id || undefined,
        area: input.area,
        code: input.code.trim(),
        label: input.label.trim(),
        labelEn: input.labelEn?.trim() || undefined,
        description: input.description?.trim() || undefined,
        descriptionEn: input.descriptionEn?.trim() || undefined,
        href: input.href.trim(),
        icon: input.icon?.trim() || undefined,
        requiresAuth: input.requiresAuth,
        isActive: input.isActive,
        sortOrder: Number(input.sortOrder) || 0,
        metadata,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "navigation-menus"] });
      queryClient.invalidateQueries({ queryKey: ["navigation-menus"] });
      setEditing(null);
      toast.success(t("page.navigationMenus.saved"));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/navigation-menus/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "navigation-menus"] });
      queryClient.invalidateQueries({ queryKey: ["navigation-menus"] });
      toast.success(t("page.navigationMenus.deleted"));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
  });

  const columns: Column<NavigationMenuItem>[] = [
    {
      header: t("common.name"),
      cell: (item) => (
        <div className="min-w-0">
          <div className="font-medium">{item.label}</div>
          <div className="text-xs text-muted-foreground">{item.labelEn || item.code}</div>
        </div>
      ),
    },
    { header: t("page.navigationMenus.area"), cell: (item) => areaLabel(item.area, t) },
    { header: t("page.navigationMenus.href"), cell: (item) => <code className="text-xs">{item.href}</code> },
    { header: t("page.navigationMenus.icon"), cell: (item) => item.icon || "—" },
    { header: t("common.sort"), cell: (item) => item.sortOrder },
    {
      header: t("common.status"),
      cell: (item) => (
        <span className={item.isActive ? "text-emerald-500" : "text-muted-foreground"}>
          {item.isActive ? t("common.active") : t("common.inactive")}
        </span>
      ),
    },
    {
      header: "",
      cell: (item) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(formFromRow(item))}>
            <Edit3 className="h-4 w-4" />
            {t("common.edit")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() =>
              window.confirm(t("page.navigationMenus.deleteConfirm")) && remove.mutate(item.id)
            }
          >
            <Trash2 className="h-4 w-4" />
            {t("common.delete")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("page.navigationMenus.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("page.navigationMenus.description")}</p>
        </div>
        <Button onClick={() => setEditing(empty())}>
          <Plus className="h-4 w-4" />
          {t("page.navigationMenus.new")}
        </Button>
      </header>

      <div className="w-full max-w-xs">
        <Select value={area} onValueChange={(value) => setArea(value as NavigationMenuArea | "ALL")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("common.all")}</SelectItem>
            {menuAreas.map((item) => (
              <SelectItem key={item} value={item}>
                {areaLabel(item, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <AdminTable
        rows={table.rows}
        columns={columns}
        loading={itemsQ.isLoading}
        rowKey={(item) => item.id}
        pagination={table.pagination}
      />

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          <DialogTitle>
            {editing?.id ? t("page.navigationMenus.editTitle") : t("page.navigationMenus.newTitle")}
          </DialogTitle>
          {editing ? (
            <NavigationMenuEditor
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

function NavigationMenuEditor({
  value,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  value: NavigationMenuForm;
  onChange: (value: NavigationMenuForm) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const { t } = useAdminI18n();
  const patch = (next: Partial<NavigationMenuForm>) => onChange({ ...value, ...next });

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_120px]">
        <Field label={t("page.navigationMenus.area")}>
          <Select value={value.area} onValueChange={(area) => patch({ area: area as NavigationMenuArea })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {menuAreas.map((item) => (
                <SelectItem key={item} value={item}>
                  {areaLabel(item, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("page.navigationMenus.code")}>
          <Input value={value.code} onChange={(event) => patch({ code: event.target.value })} />
        </Field>
        <Field label={t("common.sort")}>
          <Input
            type="number"
            value={value.sortOrder}
            onChange={(event) => patch({ sortOrder: Number(event.target.value) || 0 })}
          />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label={t("page.navigationMenus.labelZh")}>
          <Input value={value.label} onChange={(event) => patch({ label: event.target.value })} />
        </Field>
        <Field label={t("page.navigationMenus.labelEn")}>
          <Input value={value.labelEn ?? ""} onChange={(event) => patch({ labelEn: event.target.value })} />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Field label={t("page.navigationMenus.descriptionZh")}>
          <Input
            value={value.description ?? ""}
            onChange={(event) => patch({ description: event.target.value })}
          />
        </Field>
        <Field label={t("page.navigationMenus.descriptionEn")}>
          <Input
            value={value.descriptionEn ?? ""}
            onChange={(event) => patch({ descriptionEn: event.target.value })}
          />
        </Field>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_180px]">
        <Field label={t("page.navigationMenus.href")}>
          <Input
            value={value.href}
            onChange={(event) => patch({ href: event.target.value })}
            placeholder="/templates"
          />
        </Field>
        <Field label={t("page.navigationMenus.icon")}>
          <Input
            value={value.icon ?? ""}
            onChange={(event) => patch({ icon: event.target.value })}
            placeholder="layout-template"
          />
        </Field>
      </div>

      <Field label={t("page.navigationMenus.metadata")}>
        <Textarea
          rows={6}
          className="font-mono text-xs"
          value={value.metadataText}
          onChange={(event) => patch({ metadataText: event.target.value })}
          placeholder='{"studioMode":"image"}'
        />
      </Field>

      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={value.isActive} onCheckedChange={(isActive) => patch({ isActive })} />
          {t("common.active")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={value.requiresAuth}
            onCheckedChange={(requiresAuth) => patch({ requiresAuth })}
          />
          {t("page.navigationMenus.requiresAuth")}
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        <Button onClick={onSave} disabled={saving || !value.code.trim() || !value.label.trim() || !value.href.trim()}>
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function areaLabel(area: NavigationMenuArea, t: ReturnType<typeof useAdminI18n>["t"]) {
  return area === "HEADER"
    ? t("page.navigationMenus.area.header")
    : t("page.navigationMenus.area.dashboard");
}
