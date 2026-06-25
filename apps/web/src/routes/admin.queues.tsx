import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";
import { useAdminI18n } from "@/lib/admin-i18n";

export const Route = createFileRoute("/admin/queues")({
  component: AdminQueues,
});

interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

interface RecentJob {
  id?: string | null;
  name: string;
  data: unknown;
  failedReason?: string;
}

interface RecentResp {
  waiting: RecentJob[];
  active: RecentJob[];
  failed: RecentJob[];
  completed: RecentJob[];
}

function AdminQueues() {
  const { t } = useAdminI18n();
  const statsQ = useQuery({
    queryKey: ["admin", "queues", "stats"],
    queryFn: () => apiGet<QueueStats>("/api/admin/queues"),
    refetchInterval: 3000,
  });
  const recentQ = useQuery({
    queryKey: ["admin", "queues", "recent"],
    queryFn: () => apiGet<RecentResp>("/api/admin/queues/recent"),
    refetchInterval: 5000,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t("page.queues.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("page.queues.description")}</p>
      </header>

      {statsQ.data ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {(["waiting", "active", "completed", "failed", "delayed"] as const).map((k) => (
            <div key={k} className="glass rounded-2xl p-5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{k}</div>
              <div className="mt-2 text-2xl font-bold">{statsQ.data[k]}</div>
            </div>
          ))}
        </div>
      ) : null}

      {recentQ.data ? (
        <div className="grid gap-4 md:grid-cols-2">
          {(["active", "waiting", "completed", "failed"] as const).map((k) => (
            <div key={k} className="glass rounded-2xl p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{k}</div>
              <div className="mt-2 space-y-1 text-xs">
                {recentQ.data[k].length === 0 ? (
                  <div className="text-muted-foreground">{t("page.queues.none")}</div>
                ) : (
                  recentQ.data[k].map((j) => (
                    <div key={j.id ?? Math.random()} className="rounded bg-secondary/40 px-2 py-1">
                      <code>{j.name}</code> · {JSON.stringify(j.data)}{" "}
                      {j.failedReason ? (
                        <span className="text-destructive">{j.failedReason}</span>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
