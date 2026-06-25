import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  AdminTable,
  type AdminPaginatedResult,
  type Column,
} from "@/components/admin/AdminTable";
import { apiGet } from "@/lib/api-client";
import { useAdminI18n } from "@/lib/admin-i18n";

export const Route = createFileRoute("/admin/audit-log")({
  component: AdminAuditLog,
});

interface AuditRow {
  id: string;
  action: string;
  targetType: string;
  targetId?: string;
  ip?: string;
  createdAt: string;
  admin?: { email: string };
}

function AdminAuditLog() {
  const { t, formatDateTime } = useAdminI18n();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "audit-log", page, pageSize],
    queryFn: () =>
      apiGet<AdminPaginatedResult<AuditRow>>("/api/admin/audit-log", {
        query: { page, pageSize },
      }),
    placeholderData: keepPreviousData,
  });

  const rows = data?.items ?? [];

  const columns: Column<AuditRow>[] = [
    { header: t("common.time"), cell: (a) => formatDateTime(a.createdAt) },
    { header: t("common.admin"), cell: (a) => a.admin?.email ?? t("common.system") },
    { header: t("common.actions"), cell: (a) => a.action },
    { header: t("common.target"), cell: (a) => `${a.targetType}${a.targetId ? "/" + a.targetId : ""}` },
    { header: t("page.audit.ip"), cell: (a) => a.ip ?? "" },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t("page.audit.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("page.audit.description")}</p>
      </header>
      <AdminTable
        rows={rows}
        columns={columns}
        loading={isLoading}
        rowKey={(a) => a.id}
        pagination={{
          page: data?.page ?? page,
          pageSize: data?.pageSize ?? pageSize,
          pageCount: Math.max(data?.pageCount ?? 1, 1),
          total: data?.total ?? rows.length,
          itemCount: rows.length,
          hasNextPage: data?.hasNextPage ?? false,
          hasPreviousPage: data?.hasPreviousPage ?? page > 1,
          onPageChange: setPage,
          onPageSizeChange: (size) => {
            setPageSize(size);
            setPage(1);
          },
        }}
      />
    </div>
  );
}
