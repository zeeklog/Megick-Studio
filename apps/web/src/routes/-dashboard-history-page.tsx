import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Copy,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Search,
  Trash,
  Video,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/hooks/useAuth";
import { apiGet, apiDelete } from "@/lib/api-client";
import { ossThumbnailUrl } from "@/lib/oss-upload";
import type { GenerationJobPublic } from "@megick/api-types";
import { studioGenerationErrorNotice } from "@/components/studio/panel/generation-error-presenter";
import { jobOutputContentUrl } from "@/components/studio/panel/utils";
import type { StudioResult } from "./-dashboard-types";
import { localizedImageEditModeLabelFromParams } from "@/lib/studio-i18n";
import {
  PanelHeader,
  LoadingRows,
  EmptyState,
  StatusBadge,
  formatDateTime,
} from "./-dashboard-components";
import { useI18n } from "@/lib/i18n";

export type HistoryTypeFilter = "all" | "TEXT2IMAGE" | "IMAGE2VIDEO" | "IMAGE_EDIT";
export type HistorySearch = {
  prompt?: string;
  status?: string;
  type?: HistoryTypeFilter;
  jobId?: string;
};
type Translate = ReturnType<typeof useI18n>["t"];

type HistoryEntry = { id: string; job: GenerationJobPublic; jobs: GenerationJobPublic[] };

function imageEditModeLabel(job: GenerationJobPublic, t: Translate) {
  if (job.type !== "IMAGE_EDIT") return null;
  return localizedImageEditModeLabelFromParams(job.params, job.modelCode, t);
}

function createdTime(job: GenerationJobPublic) {
  return new Date(job.createdAt).getTime();
}

function buildHistoryEntries(jobs: GenerationJobPublic[]): HistoryEntry[] {
  return jobs
    .map((job) => ({ id: job.id, job, jobs: [job] }))
    .sort((a, b) => createdTime(b.job) - createdTime(a.job));
}

function entryTitle(entry: HistoryEntry, _t: Translate) {
  return entry.job.prompt;
}

function entryPrompt(entry: HistoryEntry, _t: Translate) {
  return entry.job.prompt;
}

function entryFailureMessages(entry: HistoryEntry, t: Translate) {
  return entry.jobs
    .filter((job) => job.errorMessage || job.status === "failed" || job.status === "canceled")
    .map((job, index) => {
      const notice = studioGenerationErrorNotice({
        rawMessage: job.errorMessage,
        t,
      });
      return {
        id: job.id,
        title: entry.jobs.length > 1 ? t("history.imageIndex", { index: index + 1 }) : null,
        message: notice.message,
      };
    })
    .filter((item) => item.message.trim().length > 0);
}

function entryStatus(entry: HistoryEntry): GenerationJobPublic["status"] {
  return entry.job.status;
}

function entryProgress(entry: HistoryEntry) {
  return normalizedProgress(entry.job);
}

function entryCostCredits(entry: HistoryEntry) {
  return entry.jobs.reduce((sum, job) => sum + job.costCredits, 0);
}

function entryOutputCount(entry: HistoryEntry) {
  return entry.jobs.reduce((sum, job) => sum + job.outputUrls.length, 0);
}

function historyModelLabel(job: GenerationJobPublic, fallback: string, t: Translate) {
  return imageEditModeLabel(job, t) ?? job.modelDisplayName ?? fallback;
}

export function HistoryPage({ search }: { search: HistorySearch }) {
  const { user } = useAuth();
  const [page, setPage] = useState(0);

  const jobsQ = useQuery({
    queryKey: ["dashboard", "jobs", search.prompt, search.status, search.type, page],
    queryFn: () =>
      apiGet<GenerationJobPublic[]>("/api/generation/jobs", {
        query: {
          mine: true,
          limit: 24,
          offset: page * 24,
          prompt: search.prompt || undefined,
          status: search.status || undefined,
          type: search.type && search.type !== "all" ? search.type : undefined,
        },
      }),
    enabled: !!user,
    refetchInterval: (q) =>
      q.state.data?.some((job) => job.status === "queued" || job.status === "running")
        ? 3000
        : false,
  });
  const routeJobQ = useQuery({
    queryKey: ["jobs", search.jobId],
    queryFn: () => apiGet<GenerationJobPublic>(`/api/generation/jobs/${search.jobId}`),
    enabled: !!user && Boolean(search.jobId),
  });
  const routeJobs = useMemo(
    () => (routeJobQ.data ? [routeJobQ.data] : []),
    [routeJobQ.data],
  );
  const mergedJobs = useMemo(() => {
    const map = new Map<string, GenerationJobPublic>();
    for (const job of jobsQ.data ?? []) map.set(job.id, job);
    for (const job of routeJobs) map.set(job.id, job);
    return Array.from(map.values());
  }, [jobsQ.data, routeJobs]);

  return (
    <HistoryPanel
      jobs={mergedJobs}
      loading={jobsQ.isLoading || routeJobQ.isLoading}
      refreshing={jobsQ.isFetching || routeJobQ.isFetching}
      onRefresh={() => {
        void Promise.all([jobsQ.refetch(), routeJobQ.refetch()]);
      }}
      page={page}
      setPage={setPage}
      searchParams={search}
    />
  );
}

function HistoryPanel({
  jobs,
  loading,
  refreshing,
  onRefresh,
  page,
  setPage,
  searchParams,
}: {
  jobs: GenerationJobPublic[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  page: number;
  setPage: (p: number) => void;
  searchParams: { prompt?: string; status?: string; type?: HistoryTypeFilter; jobId?: string };
}) {
  const { t, formatNumber, locale } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [detailEntryId, setDetailEntryId] = useState<string | null>(null);
  const entries = useMemo(() => buildHistoryEntries(jobs), [jobs]);
  const routeJobEntry = searchParams.jobId
    ? entries.find((entry) => entry.jobs.some((job) => job.id === searchParams.jobId))
    : undefined;
  const detailEntry = entries.find((entry) => entry.id === detailEntryId) ?? routeJobEntry ?? null;

  const handleSearch = (val: string) => {
    navigate({ to: "/dashboard/history", search: { ...searchParams, prompt: val || undefined } });
    setPage(0);
  };

  const handleStatus = (status: string) => {
    navigate({
      to: "/dashboard/history",
      search: { ...searchParams, status: status === "all" ? undefined : status },
    });
    setPage(0);
  };

  const handleType = (type: string) => {
    navigate({
      to: "/dashboard/history",
      search: { ...searchParams, type: type as HistoryTypeFilter },
    });
    setSelectedIds([]);
    setPage(0);
  };

  const handleBatchDelete = async () => {
    if (!window.confirm(t("history.deleteConfirm", { count: selectedIds.length }))) return;
    setDeleting(true);
    try {
      await Promise.all(selectedIds.map((id) => apiDelete(`/api/generation/jobs/${id}`)));
      queryClient.invalidateQueries({ queryKey: ["dashboard", "jobs"] });
      setSelectedIds([]);
    } catch (err) {
      toast.error(t("history.deleteFailed"));
    } finally {
      setDeleting(false);
    }
  };

  const allSelected = jobs.length > 0 && selectedIds.length === jobs.length;
  const toggleAll = () => {
    if (allSelected) setSelectedIds([]);
    else setSelectedIds(jobs.map((j) => j.id));
  };
  const toggleEntry = (entry: HistoryEntry) => {
    const ids = entry.jobs.map((job) => job.id);
    const selected = ids.every((id) => selectedIds.includes(id));
    setSelectedIds((prev) =>
      selected ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids])),
    );
  };
  const openEntry = (entry: HistoryEntry) => {
    setDetailEntryId(entry.id);
    navigate({
      to: "/dashboard/history",
      search: { ...searchParams, jobId: entry.job.id },
      replace: true,
    });
  };
  const closeDetail = () => {
    setDetailEntryId(null);
    navigate({
      to: "/dashboard/history",
      search: { ...searchParams, jobId: undefined },
      replace: true,
    });
  };

  return (
    <section
      className="rounded-lg border border-border bg-card"
      data-onboarding-target="generation-history-panel"
    >
      <PanelHeader
        title={t("history.title")}
        description={t("history.description")}
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={onRefresh}
              disabled={refreshing}
              className="w-full sm:w-auto"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {t("history.refresh")}
            </Button>
            <Button asChild className="w-full bg-gradient-primary sm:w-auto">
              <Link to="/dashboard/studio/image">
                {t("dashboard.newGeneration")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        }
      />
      <div
        className="flex flex-col items-stretch justify-between gap-3 border-b border-border p-4 lg:flex-row lg:items-center"
        data-onboarding-target="generation-history-filters"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Tabs value={searchParams.type ?? "all"} onValueChange={handleType}>
            <TabsList className="grid w-full grid-cols-4 sm:w-auto">
              <TabsTrigger value="all">{t("history.tab.all")}</TabsTrigger>
              <TabsTrigger value="TEXT2IMAGE">{t("history.tab.image")}</TabsTrigger>
              <TabsTrigger value="IMAGE_EDIT">{t("history.tab.imageEdit")}</TabsTrigger>
              <TabsTrigger value="IMAGE2VIDEO">{t("history.tab.video")}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("history.searchPlaceholder")}
              className="pl-9"
              defaultValue={searchParams.prompt}
              onBlur={(e) => handleSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch(e.currentTarget.value)}
            />
          </div>
          <Select value={searchParams.status || "all"} onValueChange={handleStatus}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder={t("common.status")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("history.allStatuses")}</SelectItem>
              <SelectItem value="succeeded">{t("common.status.succeeded")}</SelectItem>
              <SelectItem value="failed">{t("common.status.failed")}</SelectItem>
              <SelectItem value="running">{t("common.status.running")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {selectedIds.length > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBatchDelete}
            disabled={deleting}
            className="w-full sm:w-auto"
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash className="h-4 w-4 mr-2" />
            )}
            {t("history.deleteSelected", { count: selectedIds.length })}
          </Button>
        )}
      </div>
      {loading && page === 0 ? (
        <LoadingRows />
      ) : entries.length === 0 ? (
        <div className="p-6">
          <EmptyState title={t("history.empty.title")} detail={t("history.empty.detail")} />
        </div>
      ) : (
        <>
          <div className="grid gap-3 p-4 md:hidden">
            <label className="flex items-center gap-2 rounded-lg border border-border bg-background/35 px-3 py-2 text-sm text-muted-foreground">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              {t("common.selectAll")}
            </label>
            {entries.map((entry) => (
              <HistoryMobileCard
                key={entry.id}
                entry={entry}
                selected={entry.jobs.every((job) => selectedIds.includes(job.id))}
                onToggle={() => toggleEntry(entry)}
                onOpen={() => openEntry(entry)}
              />
            ))}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                  </TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("common.prompt")}</TableHead>
                  <TableHead>{t("common.model")}</TableHead>
                  <TableHead>{t("history.progress")}</TableHead>
                  <TableHead>{t("common.cost")}</TableHead>
                  <TableHead>{t("common.created")}</TableHead>
                  <TableHead className="text-right">{t("common.action")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const failureMessages = entryFailureMessages(entry, t);
                  const firstFailure = failureMessages[0];
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={entry.jobs.every((job) => selectedIds.includes(job.id))}
                          onCheckedChange={() => toggleEntry(entry)}
                        />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={entryStatus(entry)} />
                      </TableCell>
                      <TableCell className="max-w-[420px]">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="line-clamp-1 text-sm font-medium">
                              {entryTitle(entry, t)}
                            </p>
                          </div>
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {entryPrompt(entry, t)}
                          </p>
                          {firstFailure ? (
                            <p className="line-clamp-2 text-xs leading-relaxed text-destructive">
                              {t("common.reason")}：
                              {firstFailure.title ? `${firstFailure.title} · ` : ""}
                              {firstFailure.message}
                              {failureMessages.length > 1 ? ` +${failureMessages.length - 1}` : ""}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {historyModelLabel(entry.job, t("history.unknownModel"), t)}
                      </TableCell>
                      <TableCell>
                        <EntryProgress entry={entry} />
                      </TableCell>
                      <TableCell>
                        {formatNumber(entryCostCredits(entry))} {t("common.credits")}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(entry.job.createdAt, locale)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => openEntry(entry)}>
                          {t("common.open")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col items-stretch justify-between gap-3 border-t border-border p-4 sm:flex-row sm:items-center">
            <span className="text-sm text-muted-foreground">
              {t("common.showingRecords", { count: jobs.length, page: page + 1 })}
            </span>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                {t("common.previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={jobs.length < 24}
                onClick={() => setPage(page + 1)}
              >
                {t("common.next")}
              </Button>
            </div>
          </div>
        </>
      )}
      <JobDetailDialog
        entry={detailEntry}
        open={Boolean(detailEntry)}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
      />
    </section>
  );
}

function HistoryMobileCard({
  entry,
  selected,
  onToggle,
  onOpen,
}: {
  entry: HistoryEntry;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const { t, formatNumber, locale } = useI18n();
  const failureMessages = entryFailureMessages(entry, t);
  const firstFailure = failureMessages[0];

  return (
    <article className="rounded-lg border border-border bg-background/35 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Checkbox checked={selected} onCheckedChange={onToggle} className="mt-1" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={entryStatus(entry)} />
            </div>
            <p className="mt-3 line-clamp-1 text-sm font-medium">{entryTitle(entry, t)}</p>
            <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
              {entryPrompt(entry, t)}
            </p>
            {firstFailure ? (
              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-destructive">
                {t("common.reason")}：{firstFailure.title ? `${firstFailure.title} · ` : ""}
                {firstFailure.message}
                {failureMessages.length > 1 ? ` +${failureMessages.length - 1}` : ""}
              </p>
            ) : null}
            <div className="mt-3">
              <EntryProgress entry={entry} />
            </div>
          </div>
        </div>
        <Button size="sm" variant="outline" className="shrink-0" onClick={onOpen}>
          {t("common.open")}
        </Button>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-muted-foreground">{t("common.model")}</dt>
          <dd className="mt-1 truncate font-medium">
            {historyModelLabel(entry.job, t("history.unknownModel"), t)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("common.cost")}</dt>
          <dd className="mt-1 font-medium">
            {formatNumber(entryCostCredits(entry))} {t("common.credits")}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">{t("common.created")}</dt>
          <dd className="mt-1 font-medium">{formatDateTime(entry.job.createdAt, locale)}</dd>
        </div>
      </dl>
    </article>
  );
}

function normalizedProgress(job: GenerationJobPublic) {
  if (job.status === "succeeded" || job.status === "failed" || job.status === "canceled")
    return 100;
  if (typeof job.progress !== "number" || !Number.isFinite(job.progress)) return 0;
  return Math.min(100, Math.max(0, Math.round(job.progress)));
}

function EntryProgress({ entry }: { entry: HistoryEntry }) {
  const { t } = useI18n();
  const progress = entryProgress(entry);

  return (
    <div className="min-w-[128px] space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{t("history.progress")}</span>
        <span className="font-medium tabular-nums">{progress}%</span>
      </div>
      <Progress value={progress} className="h-1.5" />
    </div>
  );
}

function jobOutputKind(job: GenerationJobPublic) {
  return job.type === "IMAGE2VIDEO" ? "video" : "image";
}

function jobOutputProxyUrl(job: GenerationJobPublic, index: number, variant?: "thumbnail") {
  const item: StudioResult = {
    id: `${job.id}-history-${index}`,
    src: job.outputUrls[index] ?? "",
    kind: jobOutputKind(job),
    prompt: job.prompt,
    chatSessionId: job.chatSessionId ?? undefined,
    jobId: job.id,
    outputIndex: index,
  };
  return jobOutputContentUrl(item, variant);
}

function historyImagePreviewUrl(
  job: GenerationJobPublic,
  item: { url?: string | null; thumbnailUrl?: string | null },
  index: number,
) {
  return (
    item.thumbnailUrl ??
    jobOutputProxyUrl(job, index, "thumbnail") ??
    ossThumbnailUrl(item.url) ??
    ""
  );
}

function DetailStat({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="rounded-lg border border-border bg-background/35 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium">{value || "-"}</p>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const { t } = useI18n();
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    toast.success(t("common.copied"));
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
      <Copy className="h-4 w-4" />
      {t("common.copy")}
    </Button>
  );
}

function CollapsiblePrompt({
  title,
  prompt,
  defaultOpen,
}: {
  title: string;
  prompt: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-border">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-background/35 px-4 py-3">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 items-center gap-2 text-left text-sm font-medium"
          >
            {open ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
            <span className="truncate">{title}</span>
          </button>
        </CollapsibleTrigger>
        <CopyButton text={prompt} />
      </div>
      <CollapsibleContent>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-relaxed text-muted-foreground">
          {prompt}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ParamsPanel({ jobs }: { jobs: GenerationJobPublic[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const text = JSON.stringify(
    jobs.length === 1 ? (jobs[0].params ?? {}) : jobs.map((job) => ({ id: job.id, params: job.params ?? {} })),
    null,
    2,
  );

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-border">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-background/35 px-4 py-3">
        <CollapsibleTrigger asChild>
          <button type="button" className="flex items-center gap-2 text-sm font-medium">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {t("history.params")}
          </button>
        </CollapsibleTrigger>
        <CopyButton text={text} />
      </div>
      <CollapsibleContent>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-relaxed text-muted-foreground">
          {text}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

function JobResultPreview({ job }: { job: GenerationJobPublic }) {
  const { t } = useI18n();
  const kind = jobOutputKind(job);
  const items: Array<{ url?: string | null; thumbnailUrl?: string | null }> = job.outputItems?.length
    ? job.outputItems
    : job.outputUrls.map((url) => ({ url }));
  if (!items.length) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        {t("history.noResults")}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item, index) => {
        const url = item.url ?? "";
        const previewUrl = kind === "image" ? historyImagePreviewUrl(job, item, index) : url;
        return (
          <div
            key={`${job.id}-${index}`}
            className="overflow-hidden rounded-lg border border-border bg-background/35"
          >
            {kind === "video" ? (
              <video controls className="aspect-video w-full bg-black object-contain">
                <source src={url} />
              </video>
            ) : (
              <img
                src={previewUrl}
                alt={t("history.resultAlt")}
                className="aspect-square w-full object-cover"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function JobDetailDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: HistoryEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, formatNumber, locale } = useI18n();
  if (!entry) return null;
  const title = entryTitle(entry, t);
  const outputCount = entryOutputCount(entry);
  const failureMessages = entryFailureMessages(entry, t);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-8">
            {jobOutputKind(entry.job) === "video" ? (
              <Video className="h-5 w-5" />
            ) : (
              <ImageIcon className="h-5 w-5" />
            )}
            {title}
          </DialogTitle>
          <DialogDescription>
            {`${historyModelLabel(entry.job, t("history.unknownModel"), t)} · ${entry.job.type} · ${t("history.outputCount", { count: outputCount })}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DetailStat
              label={t("common.status")}
              value={t(`common.status.${entryStatus(entry)}`)}
            />
            <DetailStat
              label={t("common.model")}
              value={historyModelLabel(entry.job, t("history.unknownModel"), t)}
            />
            <DetailStat
              label={t("common.cost")}
              value={`${formatNumber(entryCostCredits(entry))} ${t("common.credits")}`}
            />
            <DetailStat
              label={t("common.created")}
              value={formatDateTime(entry.job.createdAt, locale)}
            />
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">{t("history.promptTitle")}</p>
            {entry.jobs.map((job, index) => (
              <CollapsiblePrompt
                key={job.id}
                title={entry.jobs.length > 1 ? t("history.imageIndex", { index: index + 1 }) : t("history.generationPrompt")}
                prompt={job.prompt}
                defaultOpen={index === 0}
              />
            ))}
          </div>

          <ParamsPanel jobs={entry.jobs} />

          {failureMessages.length ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-destructive">{t("history.failureInfo")}</p>
              {failureMessages.map((failure) => (
                <div
                  key={failure.id}
                  className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  {failure.title ? `${failure.title}：` : null}
                  {failure.message}
                </div>
              ))}
            </div>
          ) : null}

          <div className="space-y-3">
            <p className="text-sm font-medium">{t("history.results")}</p>
            <JobResultPreview job={entry.job} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
