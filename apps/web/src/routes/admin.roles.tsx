import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminTable, useAdminClientPagination, type Column } from "@/components/admin/AdminTable";
import { apiGet } from "@/lib/api-client";
import { useAdminI18n } from "@/lib/admin-i18n";

export const Route = createFileRoute("/admin/roles")({
  component: AdminRoles,
});

interface RoleRow {
  id: string;
  code: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: { permission: { code: string } }[];
  _count: { users: number };
}

function AdminRoles() {
  const { t } = useAdminI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "roles"],
    queryFn: () => apiGet<RoleRow[]>("/api/admin/rbac/roles"),
  });

  const table = useAdminClientPagination(data ?? []);

  const columns: Column<RoleRow>[] = [
    { header: "Code", cell: (r) => <code>{r.code}</code> },
    { header: "Name", cell: (r) => r.name },
    { header: t("page.roles.system"), cell: (r) => (r.isSystem ? "✓" : "—") },
    { header: t("common.users"), cell: (r) => r._count.users },
    { header: t("common.permissions"), cell: (r) => r.permissions.length },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t("page.roles.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("page.roles.description")}</p>
      </header>
      <AdminTable
        rows={table.rows}
        columns={columns}
        loading={isLoading}
        rowKey={(r) => r.id}
        pagination={table.pagination}
      />
    </div>
  );
}
