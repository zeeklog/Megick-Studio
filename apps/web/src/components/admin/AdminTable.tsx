import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminI18n } from "@/lib/admin-i18n";
import { cn } from "@/lib/utils";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

export interface AdminPagination {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  itemCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
}

export interface AdminPaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  empty?: string;
  loading?: boolean;
  rowKey: (row: T) => string;
  pagination?: AdminPagination;
  className?: string;
}

const defaultPageSizeOptions = [10, 25, 50, 100] as const;

export function useAdminClientPagination<T>(
  rows: T[],
  options: { initialPageSize?: number; resetKeys?: readonly unknown[] } = {},
) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(options.initialPageSize ?? 10);
  const resetToken = JSON.stringify(options.resetKeys ?? []);

  useEffect(() => {
    setPage(1);
  }, [pageSize, resetToken]);

  const pageCount = Math.max(Math.ceil(rows.length / pageSize), 1);
  const currentPage = Math.min(page, pageCount);

  useEffect(() => {
    if (page !== currentPage) setPage(currentPage);
  }, [currentPage, page]);

  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [currentPage, pageSize, rows]);

  return {
    rows: pagedRows,
    pagination: {
      page: currentPage,
      pageSize,
      pageCount,
      total: rows.length,
      itemCount: pagedRows.length,
      hasPreviousPage: currentPage > 1,
      hasNextPage: currentPage < pageCount,
      onPageChange: setPage,
      onPageSizeChange: setPageSize,
    } satisfies AdminPagination,
  };
}

export function AdminTable<T>({
  rows,
  columns,
  empty,
  loading,
  rowKey,
  pagination,
  className,
}: Props<T>) {
  const { t, formatNumber } = useAdminI18n();
  const emptyText = empty ?? t("common.empty");

  if (loading && !rows.length) {
    return (
      <div className="rounded-lg border border-border/70 bg-card/70 p-6 text-sm text-muted-foreground shadow-sm">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border/70 bg-card/70 shadow-sm",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-secondary/45 text-xs uppercase text-muted-foreground">
            <tr>
              {columns.map((c, idx) => (
                <th key={idx} className={cn("px-4 py-3 text-left font-semibold", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows.length ? (
              rows.map((row) => (
                <tr key={rowKey(row)} className="transition hover:bg-secondary/25">
                  {columns.map((c, idx) => (
                    <td key={idx} className={cn("px-4 py-3 align-middle", c.className)}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pagination ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 bg-background/30 px-4 py-3">
          <div className="text-sm text-muted-foreground">
            {t("common.pagination.summary", {
              count: formatNumber(pagination.itemCount),
              total: formatNumber(pagination.total),
            })}
            <span className="mx-2 text-border">/</span>
            {t("common.pagination.page", {
              page: formatNumber(pagination.page),
              pageCount: formatNumber(Math.max(pagination.pageCount, 1)),
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pagination.onPageSizeChange ? (
              <Select
                value={String(pagination.pageSize)}
                onValueChange={(value) => pagination.onPageSizeChange?.(Number(value))}
              >
                <SelectTrigger className="h-8 w-[118px] bg-background/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(pagination.pageSizeOptions ?? defaultPageSizeOptions).map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {t("common.pageSize", { size })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!pagination.hasPreviousPage}
              onClick={() => pagination.onPageChange(Math.max(1, pagination.page - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              {t("common.previous")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!pagination.hasNextPage}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              {t("common.next")}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
