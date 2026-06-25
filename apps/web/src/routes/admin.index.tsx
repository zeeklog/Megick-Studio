import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, Coins, ImageIcon, MessageSquare, Sparkles, TrendingUp, Users } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { apiGet } from "@/lib/api-client";
import { useAdminI18n } from "@/lib/admin-i18n";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

interface DashboardResp {
  totals: {
    users: number;
    users30d: number;
    jobs30d: number;
    succeededJobs30d: number;
    failedJobs30d: number;
    activeJobs: number;
    chats30d: number;
    assets30d: number;
  };
  credits: {
    totalBalance: number;
    granted30d: number;
    spent1h: number;
    spent24h: number;
    spent7d: number;
    spent30d: number;
  };
  growth: {
    usersToday: number;
    usersYesterday: number;
    jobsToday: number;
    jobsYesterday: number;
  };
  userLifecycle: {
    active7d: number;
    active30d: number;
    neverLoggedIn: number;
    pendingUsers: number;
    disabledUsers: number;
  };
  engagement: {
    generatingUsers30d: number;
    chats30d: number;
    assets30d: number;
    generationSuccessRate30d: number;
  };
  trends: Array<{
    date: string;
    users: number;
    jobs: number;
    succeededJobs: number;
    failedJobs: number;
    chats: number;
    assets: number;
  }>;
  generationStatus30d: Record<string, number>;
  generationType30d: Record<string, number>;
}

const trendConfig = {
  users: { label: "Users", color: "#06b6d4" },
  jobs: { label: "Jobs", color: "#8b5cf6" },
  chats: { label: "Chats", color: "#f59e0b" },
  assets: { label: "Assets", color: "#22c55e" },
} satisfies ChartConfig;

const generationConfig = {
  value: { label: "Jobs" },
  succeeded: { label: "Succeeded", color: "#22c55e" },
  failed: { label: "Failed", color: "#ef4444" },
  running: { label: "Running", color: "#06b6d4" },
  queued: { label: "Queued", color: "#f59e0b" },
  canceled: { label: "Canceled", color: "#94a3b8" },
} satisfies ChartConfig;

const typeConfig = {
  value: { label: "Jobs", color: "#06b6d4" },
} satisfies ChartConfig;

function deltaText(current: number, previous: number) {
  if (previous === 0) return current === 0 ? "0" : `+${current}`;
  const delta = ((current - previous) / previous) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
}

function AdminDashboard() {
  const { t, formatNumber } = useAdminI18n();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "dashboard"],
    queryFn: () => apiGet<DashboardResp>("/api/admin/dashboard"),
  });

  const stats = [
    {
      label: t("page.dashboard.totalUsers"),
      value: data ? formatNumber(data.totals.users) : null,
      detail: data ? t("page.dashboard.newUsers30d", { count: formatNumber(data.totals.users30d) }) : null,
      icon: Users,
    },
    {
      label: t("page.dashboard.generations30d"),
      value: data ? formatNumber(data.totals.jobs30d) : null,
      detail: data ? `${data.engagement.generationSuccessRate30d}%` : null,
      icon: Sparkles,
    },
    {
      label: t("page.dashboard.creditBalance"),
      value: data ? formatNumber(data.credits.totalBalance) : null,
      detail: data ? t("page.dashboard.currentTotal") : null,
      icon: Coins,
    },
    {
      label: "Credits granted 30d",
      value: data ? formatNumber(data.credits.granted30d) : null,
      detail: "Manual admin grants and rewards",
      icon: Coins,
    },
    {
      label: "Chats 30d",
      value: data ? formatNumber(data.totals.chats30d) : null,
      detail: "Studio conversations",
      icon: MessageSquare,
    },
    {
      label: "Assets 30d",
      value: data ? formatNumber(data.totals.assets30d) : null,
      detail: "OSS media records",
      icon: ImageIcon,
    },
    {
      label: t("page.dashboard.activeNow"),
      value: data ? formatNumber(data.totals.activeJobs) : null,
      detail: data ? t("page.dashboard.queuedRunning") : null,
      icon: Activity,
    },
  ];

  const generationRows = data
    ? Object.entries(data.generationStatus30d)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({
        name,
        value,
        fill: `var(--color-${name})`,
      }))
    : [];

  const generationTypeRows = data
    ? Object.entries(data.generationType30d)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name, value }))
    : [];

  const trendRows = data
    ? data.trends.map((row) => ({
      ...row,
      day: row.date.slice(5),
    }))
    : [];

  const creditsSpentRows = [
    { key: "1h", label: t("page.dashboard.creditSpent1h"), value: data?.credits.spent1h },
    { key: "24h", label: t("page.dashboard.creditSpent24h"), value: data?.credits.spent24h },
    { key: "7d", label: t("page.dashboard.creditSpent7d"), value: data?.credits.spent7d },
    { key: "30d", label: t("page.dashboard.creditSpent30d"), value: data?.credits.spent30d },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t("page.dashboard.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("page.dashboard.description")}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
                {stat.label}
              </div>
              <div className="mt-2 text-2xl font-bold">{isLoading ? "—" : (stat.value ?? "0")}</div>
              <div className="mt-1 text-xs text-muted-foreground">{stat.detail ?? "—"}</div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-lg border border-border bg-card p-5 xl:col-span-2">
          <SectionHeader title={t("page.dashboard.trendTitle")} detail={t("page.dashboard.trendDetail")} />
          <ChartContainer config={trendConfig} className="mt-4 h-[280px] w-full">
            <AreaChart data={trendRows}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="day" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area dataKey="jobs" type="monotone" fill="var(--color-jobs)" fillOpacity={0.18} stroke="var(--color-jobs)" />
              <Area dataKey="assets" type="monotone" fill="var(--color-assets)" fillOpacity={0.14} stroke="var(--color-assets)" />
              <Area dataKey="chats" type="monotone" fill="var(--color-chats)" fillOpacity={0.14} stroke="var(--color-chats)" />
              <Area dataKey="users" type="monotone" fill="var(--color-users)" fillOpacity={0.18} stroke="var(--color-users)" />
            </AreaChart>
          </ChartContainer>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <SectionHeader title={t("page.dashboard.lifecycleTitle")} detail={t("page.dashboard.lifecycleDetail")} />
          <div className="mt-4 space-y-3">
            <Metric label={t("page.dashboard.active7d")} value={formatNumber(data?.userLifecycle.active7d ?? 0)} />
            <Metric label={t("page.dashboard.active30d")} value={formatNumber(data?.userLifecycle.active30d ?? 0)} />
            <Metric label={t("page.dashboard.neverLoggedIn")} value={formatNumber(data?.userLifecycle.neverLoggedIn ?? 0)} />
            <Metric label={t("page.dashboard.pendingDisabled")} value={formatNumber((data?.userLifecycle.pendingUsers ?? 0) + (data?.userLifecycle.disabledUsers ?? 0))} />
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <section className="rounded-lg border border-border bg-card p-5">
          <SectionHeader title={t("page.dashboard.creditSpendTitle")} detail={t("page.dashboard.creditSpendDetail")} />
          <div className="mt-4 space-y-3">
            {creditsSpentRows.map((row) => (
              <Metric key={row.key} label={row.label} value={row.value == null ? "—" : formatNumber(row.value)} />
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <SectionHeader title={t("page.dashboard.growthTitle")} detail={t("page.dashboard.todayVsYesterday")} />
          <div className="mt-4 space-y-3">
            <Metric
              label={t("page.dashboard.usersToday")}
              value={formatNumber(data?.growth.usersToday ?? 0)}
              detail={data ? deltaText(data.growth.usersToday, data.growth.usersYesterday) : "—"}
            />
            <Metric
              label={t("page.dashboard.jobsToday")}
              value={formatNumber(data?.growth.jobsToday ?? 0)}
              detail={data ? deltaText(data.growth.jobsToday, data.growth.jobsYesterday) : "—"}
            />
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <SectionHeader title="Engagement" detail="Last 30 days" />
          <div className="mt-4 space-y-3">
            <Metric label={t("page.dashboard.generatingUsers30d")} value={formatNumber(data?.engagement.generatingUsers30d ?? 0)} />
            <Metric label="Chats" value={formatNumber(data?.engagement.chats30d ?? 0)} />
            <Metric label={t("page.dashboard.assets30d")} value={formatNumber(data?.engagement.assets30d ?? 0)} />
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <SectionHeader title={t("page.dashboard.generationHealth")} detail={t("page.dashboard.last30d")} />
          <ChartContainer config={generationConfig} className="mt-4 h-[190px] w-full">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie data={generationRows} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70}>
                {generationRows.map((row) => (
                  <Cell key={row.name} fill={row.fill} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        </section>
      </div>

      <section className="rounded-lg border border-border bg-card p-5">
        <SectionHeader title="Generation type mix" detail={t("page.dashboard.last30d")} />
        <ChartContainer config={typeConfig} className="mt-4 h-[260px] w-full">
          <BarChart data={generationTypeRows} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid horizontal={false} />
            <XAxis type="number" hide />
            <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} width={120} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="value" fill="var(--color-value)" radius={4} />
          </BarChart>
        </ChartContainer>
      </section>
    </div>
  );
}

function SectionHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="font-semibold">{title}</h2>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <TrendingUp className="h-3.5 w-3.5" />
        {detail}
      </div>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-background/35 px-3 py-2">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-right">
        <div className="font-medium">{value}</div>
        {detail ? <div className="text-xs text-muted-foreground">{detail}</div> : null}
      </div>
    </div>
  );
}
