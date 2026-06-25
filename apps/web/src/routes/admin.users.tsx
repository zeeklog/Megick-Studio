import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { BarChart3, Clock, Mail, Sparkles, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AdminTable,
  type AdminPaginatedResult,
  type Column,
} from "@/components/admin/AdminTable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPatch, apiPost } from "@/lib/api-client";
import { useAdminI18n } from "@/lib/admin-i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/users")({
  component: AdminUsers,
});

type UserStatus = "ACTIVE" | "DISABLED" | "PENDING";
type CreditSort = "default" | "asc" | "desc";

interface AdminUserRow {
  id: string;
  email: string;
  status: UserStatus;
  createdAt: string;
  lastLoginAt?: string | null;
  profile: {
    displayName: string;
    credits: number;
    avatarUrl?: string | null;
    locale?: string;
  } | null;
  userRoles: { role: { code: string } }[];
}

interface CreditAdjustmentDialogState {
  mode: "single" | "bulk";
  userIds: string[];
  label: string;
}

interface AdminUserDashboard {
  user: {
    id: string;
    email: string;
    status: UserStatus;
    createdAt: string;
    lastLoginAt?: string | null;
    roles: string[];
    profile: {
      displayName: string;
      credits: number;
      avatarUrl?: string | null;
      locale?: string;
      localeSource?: string;
    };
  };
  overview: {
    credits: number;
    totalSpent: number;
    totalGenerations: number;
    successRate: number;
  };
  credits: {
    balance: number;
    ledgerEntries: number;
    totalGranted: number;
    totalSpent: number;
    recentLedger: Array<{
      id: string;
      delta: number;
      balanceAfter: number;
      reason: string;
      refType?: string | null;
      createdAt: string;
    }>;
  };
  generations: {
    total: number;
    last30d: number;
    succeeded: number;
    failed: number;
    running: number;
    queued: number;
    canceled: number;
    textToImage: number;
    imageToVideo: number;
    successRate: number;
    recentJobs: Array<{
      id: string;
      type: string;
      status: string;
      modelCode: string;
      prompt: string;
      costCredits: number;
      createdAt: string;
      finishedAt?: string | null;
    }>;
  };
  activity: { chatSessions: number; assets: number };
}

function AdminUsers() {
  const { t, formatDateTime, formatNumber } = useAdminI18n();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | UserStatus>("all");
  const [creditSort, setCreditSort] = useState<CreditSort>("default");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [statsUserId, setStatsUserId] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [creditDialog, setCreditDialog] = useState<CreditAdjustmentDialogState | null>(null);
  const [creditDraft, setCreditDraft] = useState({
    delta: "100",
    reason: t("page.users.reasonDefault"),
    notifyUser: true,
  });
  const queryClient = useQueryClient();

  const usersQ = useQuery({
    queryKey: ["admin", "users", q, status, creditSort, page, pageSize],
    queryFn: () =>
      apiGet<AdminPaginatedResult<AdminUserRow>>("/api/admin/users", {
        query: {
          q: q.trim() || undefined,
          status: status === "all" ? undefined : status,
          creditSort: creditSort === "default" ? undefined : creditSort,
          page,
          pageSize,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const setStatusMut = useMutation({
    mutationFn: (input: { id: string; status: UserStatus }) =>
      apiPatch(`/api/admin/users/${input.id}/status`, { status: input.status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  const adjustMut = useMutation({
    mutationFn: (input: { userIds: string[]; delta: number; reason: string; notifyUser: boolean }) => {
      if (input.userIds.length === 1) {
        return apiPost(`/api/admin/users/${input.userIds[0]}/credits/adjust`, {
          delta: input.delta,
          reason: input.reason,
          notifyUser: input.notifyUser,
        });
      }
      return apiPost("/api/admin/users/credits/adjust-bulk", input);
    },
    onSuccess: () => {
      toast.success(t("page.users.adjusted"));
      setCreditDialog(null);
      setSelectedUserIds([]);
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      if (statsUserId) {
        queryClient.invalidateQueries({ queryKey: ["admin", "users", statsUserId, "dashboard"] });
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const dashboardQ = useQuery({
    queryKey: ["admin", "users", statsUserId, "dashboard"],
    queryFn: () => apiGet<AdminUserDashboard>(`/api/admin/users/${statsUserId}/dashboard`),
    enabled: !!statsUserId,
  });

  const rows = usersQ.data?.items ?? [];
  const selectedSet = useMemo(() => new Set(selectedUserIds), [selectedUserIds]);
  const visibleUserIds = useMemo(() => rows.map((u) => u.id), [rows]);
  const selectedVisibleCount = visibleUserIds.filter((id) => selectedSet.has(id)).length;
  const allVisibleSelected = visibleUserIds.length > 0 && selectedVisibleCount === visibleUserIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  const openCreditDialog = (input: CreditAdjustmentDialogState) => {
    setCreditDraft({
      delta: "100",
      reason: t("page.users.reasonDefault"),
      notifyUser: true,
    });
    setCreditDialog(input);
  };

  const toggleRowSelection = (id: string, checked: boolean) => {
    setSelectedUserIds((current) =>
      checked
        ? current.includes(id) ? current : [...current, id]
        : current.filter((item) => item !== id),
    );
  };

  const toggleVisibleSelection = (checked: boolean) => {
    setSelectedUserIds((current) => {
      const visibleSet = new Set(visibleUserIds);
      if (!checked) return current.filter((id) => !visibleSet.has(id));
      const next = new Set(current);
      visibleUserIds.forEach((id) => next.add(id));
      return [...next];
    });
  };

  const columns: Column<AdminUserRow>[] = [
    {
      header: "",
      className: "w-12",
      cell: (u) => (
        <Checkbox
          aria-label={t("page.users.selectUser")}
          checked={selectedSet.has(u.id)}
          onCheckedChange={(checked) => toggleRowSelection(u.id, checked === true)}
        />
      ),
    },
    {
      header: t("page.users.user"),
      cell: (u) => (
        <div>
          <div className="font-medium">{u.profile?.displayName ?? u.email.split("@")[0]}</div>
          <div className="text-xs text-muted-foreground">{u.email}</div>
        </div>
      ),
    },
    { header: t("common.credits"), cell: (u) => formatNumber(u.profile?.credits ?? 0) },
    { header: t("page.users.roles"), cell: (u) => u.userRoles.map((r) => r.role.code).join(", ") || "USER" },
    {
      header: t("common.status"),
      cell: (u) => (
        <select
          className="rounded-md border border-border bg-background/40 px-2 py-1 text-xs"
          value={u.status}
          onChange={(e) =>
            setStatusMut.mutate({ id: u.id, status: e.target.value as UserStatus })
          }
        >
          <option value="ACTIVE">Active</option>
          <option value="DISABLED">Disabled</option>
          <option value="PENDING">Pending</option>
        </select>
      ),
    },
    { header: t("common.created"), cell: (u) => formatDateTime(u.createdAt) },
    {
      header: t("common.actions"),
      cell: (u) => (
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setStatsUserId(u.id)}>
            <BarChart3 className="h-4 w-4" />
            {t("page.users.viewStats")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              openCreditDialog({
                mode: "single",
                userIds: [u.id],
                label: u.profile?.displayName
                  ? `${u.profile.displayName} · ${u.email}`
                  : u.email,
              })
            }
          >
            {t("page.users.adjustCredits")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("page.users.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("page.users.description")}</p>
        </div>
        <div className="grid w-full gap-3 sm:grid-cols-3 xl:w-auto xl:min-w-[720px]">
          <Input
            placeholder={t("page.users.search")}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="bg-secondary/40"
          />
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as typeof status);
              setPage(1);
            }}
          >
            <SelectTrigger className="bg-secondary/40">
              <SelectValue placeholder={t("common.status")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("page.users.memberStatusAll")}</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="DISABLED">Disabled</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={creditSort}
            onValueChange={(value) => {
              setCreditSort(value as CreditSort);
              setPage(1);
            }}
          >
            <SelectTrigger className="bg-secondary/40">
              <SelectValue placeholder={t("page.users.creditSort")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">{t("page.users.creditSortDefault")}</SelectItem>
              <SelectItem value="asc">{t("page.users.creditSortAsc")}</SelectItem>
              <SelectItem value="desc">{t("page.users.creditSortDesc")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-card/70 px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Checkbox
            aria-label={t("page.users.selectVisible")}
            checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
            onCheckedChange={(checked) => toggleVisibleSelection(checked === true)}
          />
          <div className="text-sm text-muted-foreground">
            {t("page.users.selectedCount", { count: formatNumber(selectedUserIds.length) })}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!selectedUserIds.length}
            onClick={() => setSelectedUserIds([])}
          >
            {t("page.users.clearSelection")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!selectedUserIds.length}
            onClick={() =>
              openCreditDialog({
                mode: "bulk",
                userIds: selectedUserIds,
                label: t("page.users.bulkTarget", {
                  count: formatNumber(selectedUserIds.length),
                }),
              })
            }
          >
            <WalletCards className="h-4 w-4" />
            {t("page.users.bulkGrantCredits")}
          </Button>
        </div>
      </div>

      <AdminTable
        rows={rows}
        columns={columns}
        loading={usersQ.isLoading}
        rowKey={(u) => u.id}
        pagination={{
          page: usersQ.data?.page ?? page,
          pageSize: usersQ.data?.pageSize ?? pageSize,
          pageCount: Math.max(usersQ.data?.pageCount ?? 1, 1),
          total: usersQ.data?.total ?? rows.length,
          itemCount: rows.length,
          hasNextPage: usersQ.data?.hasNextPage ?? false,
          hasPreviousPage: usersQ.data?.hasPreviousPage ?? page > 1,
          onPageChange: setPage,
          onPageSizeChange: (size) => {
            setPageSize(size);
            setPage(1);
          },
        }}
      />

      <Dialog open={!!statsUserId} onOpenChange={(open) => !open && setStatsUserId(null)}>
        <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("page.users.dashboardStats")}</DialogTitle>
            <DialogDescription>
              {dashboardQ.data
                ? `${dashboardQ.data.user.profile.displayName} · ${dashboardQ.data.user.email}`
                : t("common.loading")}
            </DialogDescription>
          </DialogHeader>

          {dashboardQ.isLoading ? (
            <div className="rounded-lg border border-border/70 bg-card/70 p-6 text-sm text-muted-foreground">
              {t("common.loading")}
            </div>
          ) : dashboardQ.data ? (
            <UserDashboardDetails data={dashboardQ.data} />
          ) : (
            <div className="rounded-lg border border-border/70 bg-card/70 p-6 text-sm text-muted-foreground">
              {t("common.empty")}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!creditDialog} onOpenChange={(open) => !open && setCreditDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {creditDialog?.mode === "bulk"
                ? t("page.users.bulkGrantCredits")
                : t("page.users.adjustCredits")}
            </DialogTitle>
            <DialogDescription>{creditDialog?.label ?? ""}</DialogDescription>
          </DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={handleCreditSubmit}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="credit-delta">{t("page.users.creditsDelta")}</Label>
              <Input
                id="credit-delta"
                type="number"
                step="1"
                value={creditDraft.delta}
                onChange={(event) =>
                  setCreditDraft((current) => ({ ...current, delta: event.target.value }))
                }
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="credit-reason">{t("page.users.reason")}</Label>
              <Textarea
                id="credit-reason"
                className="min-h-24"
                value={creditDraft.reason}
                onChange={(event) =>
                  setCreditDraft((current) => ({ ...current, reason: event.target.value }))
                }
                required
              />
            </div>
            <label className="flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-secondary/25 px-3 py-3 text-sm">
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-medium">{t("page.users.notifyUser")}</span>
                <span className="text-xs text-muted-foreground">{t("page.users.notifyUserHelp")}</span>
              </span>
              <Switch
                checked={creditDraft.notifyUser}
                onCheckedChange={(notifyUser) =>
                  setCreditDraft((current) => ({ ...current, notifyUser }))
                }
              />
            </label>
            {creditDraft.notifyUser ? (
              <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-background/40 px-3 py-3 text-xs text-muted-foreground">
                <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{t("page.users.emailQueueHelp")}</span>
              </div>
            ) : null}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setCreditDialog(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={adjustMut.isPending}>
                {adjustMut.isPending ? t("common.loading") : t("page.users.submitAdjustment")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );

  function handleCreditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!creditDialog) return;

    const delta = Number(creditDraft.delta);
    const reason = creditDraft.reason.trim();
    if (!Number.isInteger(delta) || delta === 0) {
      toast.error(t("page.users.invalidDelta"));
      return;
    }
    if (!reason) {
      toast.error(t("page.users.reasonRequired"));
      return;
    }
    adjustMut.mutate({
      userIds: creditDialog.userIds,
      delta,
      reason,
      notifyUser: creditDraft.notifyUser,
    });
  }

  function UserDashboardDetails({ data }: { data: AdminUserDashboard }) {
    const statCards = [
      {
        label: t("page.users.creditBalance"),
        value: formatNumber(data.credits.balance),
        detail: t("page.users.totalGranted", { count: formatNumber(data.credits.totalGranted) }),
        icon: WalletCards,
      },
      {
        label: t("page.users.generations"),
        value: formatNumber(data.generations.total),
        detail: t("page.users.successRate", { pct: data.generations.successRate }),
        icon: Sparkles,
      },
      {
        label: t("page.users.assets"),
        value: formatNumber(data.activity.assets),
        detail: `${formatNumber(data.activity.chatSessions)} chats`,
        icon: BarChart3,
      },
      {
        label: t("page.users.lastLogin"),
        value: data.user.lastLoginAt ? formatDateTime(data.user.lastLoginAt) : "—",
        detail: data.user.status,
        icon: Clock,
      },
    ];

    return (
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                  {stat.label}
                </div>
                <div className="mt-2 break-words text-xl font-semibold">{stat.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{stat.detail}</div>
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-lg border border-border bg-card p-4">
            <h3 className="font-semibold">{t("page.users.creditSummary")}</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <MetricLine label={t("page.users.totalSpent")} value={formatNumber(data.credits.totalSpent)} />
              <MetricLine label={t("page.users.ledgerEntries")} value={formatNumber(data.credits.ledgerEntries)} />
              <MetricLine label={t("page.users.creditBalance")} value={formatNumber(data.overview.credits)} />
            </dl>
          </section>
          <section className="rounded-lg border border-border bg-card p-4">
            <h3 className="font-semibold">{t("page.users.generationSummary")}</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <MetricLine label={t("page.users.last30d")} value={formatNumber(data.generations.last30d)} />
              <MetricLine label="TEXT2IMAGE / EDIT" value={formatNumber(data.generations.textToImage)} />
              <MetricLine label="IMAGE2VIDEO" value={formatNumber(data.generations.imageToVideo)} />
              <MetricLine label={t("page.users.successRate")} value={`${data.generations.successRate}%`} />
            </dl>
          </section>
          <section className="rounded-lg border border-border bg-card p-4">
            <h3 className="font-semibold">Account</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <MetricLine label={t("page.users.roles")} value={data.user.roles.join(", ") || "USER"} />
              <MetricLine label="Locale" value={data.user.profile.locale ?? "—"} />
              <MetricLine label={t("common.created")} value={formatDateTime(data.user.createdAt)} />
            </dl>
          </section>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <RecentLedger entries={data.credits.recentLedger} />
          <RecentJobs jobs={data.generations.recentJobs} />
        </div>
      </div>
    );
  }

  function MetricLine({ label, value }: { label: string; value: string }) {
    return (
      <div className="flex items-center justify-between gap-3">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="font-medium">{value}</dd>
      </div>
    );
  }

  function RecentLedger({ entries }: { entries: AdminUserDashboard["credits"]["recentLedger"] }) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="font-semibold">{t("page.users.recentLedger")}</h3>
        <div className="mt-3 space-y-3">
          {entries.length ? (
            entries.map((entry) => (
              <div key={entry.id} className="rounded-md border border-border/70 bg-background/35 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className={entry.delta >= 0 ? "text-emerald-600" : "text-destructive"}>
                    {entry.delta >= 0 ? "+" : ""}
                    {formatNumber(entry.delta)}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</span>
                </div>
                <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{entry.reason}</div>
                <div className="mt-1 text-xs">{t("page.users.balanceAfter", { count: formatNumber(entry.balanceAfter) })}</div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">{t("common.empty")}</p>
          )}
        </div>
      </section>
    );
  }

  function RecentJobs({ jobs }: { jobs: AdminUserDashboard["generations"]["recentJobs"] }) {
    return (
      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="font-semibold">{t("page.users.recentJobs")}</h3>
        <div className="mt-3 space-y-3">
          {jobs.length ? (
            jobs.map((job) => (
              <div key={job.id} className="rounded-md border border-border/70 bg-background/35 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{job.type}</span>
                  <span className="text-xs text-muted-foreground">{job.status}</span>
                </div>
                <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{job.prompt}</div>
                <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                  <code>{job.modelCode}</code>
                  <span>{formatNumber(job.costCredits)} {t("common.credits")}</span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">{t("common.empty")}</p>
          )}
        </div>
      </section>
    );
  }
}
