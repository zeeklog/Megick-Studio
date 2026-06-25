import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  AdminTable,
  type AdminPaginatedResult,
  type Column,
} from "@/components/admin/AdminTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiGet } from "@/lib/api-client";
import { useAdminI18n } from "@/lib/admin-i18n";
import { modelDisplayName } from "@/lib/model-display";

export const Route = createFileRoute("/admin/generation-jobs")({
  component: AdminJobs,
});

interface JobRow {
  id: string;
  type: string;
  status: string;
  modelCode: string;
  prompt: string;
  costCredits: number;
  createdAt: string;
  user: { id: string; email: string };
}

interface ModelOption {
  code: string;
  displayName: string;
}

const statuses = ["queued", "running", "succeeded", "failed", "canceled"] as const;
const pageSizeOptions = [25, 50, 100] as const;
const autoRefreshSeconds = 30;

function AdminJobs() {
  const { locale, t, formatDateTime } = useAdminI18n();
  const [q, setQ] = useState("");
  const [model, setModel] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof pageSizeOptions)[number]>(50);
  const [refreshCountdown, setRefreshCountdown] = useState(autoRefreshSeconds);
  const filters = useMemo(
    () => ({
      q: q.trim() || undefined,
      model: model || undefined,
      status: status || undefined,
    }),
    [model, q, status],
  );
  const hasFilters = !!(filters.q || filters.model || filters.status);

  const { data, isFetching, isLoading, refetch } = useQuery({
    queryKey: ["admin", "generation-jobs", filters, page, pageSize],
    queryFn: () =>
      apiGet<AdminPaginatedResult<JobRow>>("/api/admin/generation/jobs", {
        query: { ...filters, page, pageSize },
      }),
    placeholderData: keepPreviousData,
  });
  const modelsQ = useQuery({
    queryKey: ["admin", "ai-models"],
    queryFn: () => apiGet<ModelOption[]>("/api/admin/ai-models"),
  });
  const rows = data?.items ?? [];

  useEffect(() => {
    setRefreshCountdown(autoRefreshSeconds);
  }, [filters, page, pageSize]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRefreshCountdown((seconds) => (seconds > 0 ? seconds - 1 : 0));
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (refreshCountdown !== 0) return;

    let cancelled = false;
    void refetch().finally(() => {
      if (!cancelled) setRefreshCountdown(autoRefreshSeconds);
    });

    return () => {
      cancelled = true;
    };
  }, [refetch, refreshCountdown]);

  const columns: Column<JobRow>[] = [
    { header: t("common.type"), cell: (j) => j.type },
    { header: t("common.model"), cell: (j) => <code>{j.modelCode}</code> },
    {
      header: t("common.user"),
      cell: (j) => (
        <div>
          <div className="font-medium">{j.user.email}</div>
          <div className="text-xs text-muted-foreground">{j.user.id}</div>
        </div>
      ),
    },
    { header: t("common.status"), cell: (j) => j.status },
    { header: t("common.cost"), cell: (j) => j.costCredits },
    {
      header: t("common.prompt"),
      cell: (j) => <span className="line-clamp-2 text-xs">{j.prompt}</span>,
      className: "max-w-xs",
    },
    { header: t("common.created"), cell: (j) => formatDateTime(j.createdAt) },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("page.jobs.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("page.jobs.description")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:pt-1">
          <div className="text-xs text-muted-foreground">
            {t("page.jobs.autoRefreshCountdown", { seconds: refreshCountdown })}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void refetch().finally(() => setRefreshCountdown(autoRefreshSeconds));
            }}
          >
            <RefreshCw className={isFetching ? "animate-spin" : ""} />
            {t("common.refresh")}
          </Button>
        </div>
      </header>

      <div className="grid gap-3 rounded-2xl border border-border bg-background/40 p-4 md:grid-cols-[minmax(220px,1fr)_minmax(180px,240px)_minmax(160px,200px)_auto]">
        <Input
          placeholder={t("page.jobs.search")}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="bg-secondary/40"
        />
        <select
          className="h-9 rounded-md border border-border bg-background/40 px-3 text-sm"
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            setPage(1);
          }}
        >
          <option value="">{t("page.jobs.allModels")}</option>
          {(modelsQ.data ?? []).map((m) => (
            <option key={m.code} value={m.code}>
              {modelDisplayName(m, locale)} ({m.code})
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-border bg-background/40 px-3 text-sm"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">{t("page.jobs.allStatuses")}</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          disabled={!hasFilters}
          onClick={() => {
            setQ("");
            setModel("");
            setStatus("");
            setPage(1);
          }}
        >
          {t("common.reset")}
        </Button>
      </div>

      <AdminTable
        rows={rows}
        columns={columns}
        loading={isLoading}
        empty={t("page.jobs.noMatches")}
        rowKey={(j) => j.id}
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
            setPageSize(size as (typeof pageSizeOptions)[number]);
            setPage(1);
          },
          pageSizeOptions,
        }}
      />
    </div>
  );
}
