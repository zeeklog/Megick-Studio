import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Image as ImageIcon, Search, Sparkles, Video } from "lucide-react";
import { z } from "zod";
import type {
  GenerationJobStatus,
  GenerationJobType,
  PromptTemplateCategoryPublic,
  PromptTemplateStatus,
} from "@megick/api-types";
import {
  AdminTable,
  type AdminPaginatedResult,
  type Column,
} from "@/components/admin/AdminTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPost } from "@/lib/api-client";
import { useAdminI18n } from "@/lib/admin-i18n";
import { toast } from "sonner";

const searchSchema = z.object({
  sessionId: z.string().optional(),
});

export const Route = createFileRoute("/admin/user-chats")({
  validateSearch: searchSchema,
  component: AdminUserChats,
});

interface AdminChatRow {
  id: string;
  title: string;
  archived: boolean;
  updatedAt: string;
  createdAt: string;
  user: { id: string; email: string; profile?: { displayName: string } | null };
  _count?: { messages: number; jobs: number };
}

interface AdminJob {
  id: string;
  type: GenerationJobType;
  status: GenerationJobStatus;
  prompt: string;
  modelCode: string;
  params: Record<string, unknown>;
  outputAssets: Array<{ id: string; key: string; contentType: string; url?: string | null }>;
  outputUrls: string[];
  errorMessage?: string | null;
}

interface AdminChatDetail extends AdminChatRow {
  messages: Array<{
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    metadata?: Record<string, unknown> | null;
    generationJobId?: string | null;
    generationJob?: AdminJob | null;
    createdAt: string;
  }>;
}

type ExtractDraft = {
  sessionId: string;
  messageId: string;
  generationJobId?: string;
  type: GenerationJobType;
  status: PromptTemplateStatus;
  title: string;
  category: string;
  tagsText: string;
};

function AdminUserChats() {
  const { t, formatDateTime } = useAdminI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const [q, setQ] = useState("");
  const [userId, setUserId] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    search.sessionId ?? null,
  );
  const [extractDraft, setExtractDraft] = useState<ExtractDraft | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  useEffect(() => {
    setSelectedSessionId(search.sessionId ?? null);
  }, [search.sessionId]);

  const filters = useMemo(
    () => ({ q: q.trim() || undefined, userId: userId.trim() || undefined }),
    [q, userId],
  );

  const chatsQ = useQuery({
    queryKey: ["admin", "user-chats", filters, page, pageSize],
    queryFn: () =>
      apiGet<AdminPaginatedResult<AdminChatRow>>("/api/admin/chats", {
        query: { ...filters, page, pageSize },
      }),
    placeholderData: keepPreviousData,
  });

  const detailQ = useQuery({
    queryKey: ["admin", "user-chat-detail", selectedSessionId],
    queryFn: () => apiGet<AdminChatDetail>(`/api/admin/chats/${selectedSessionId}`),
    enabled: !!selectedSessionId,
  });
  const categoriesQ = useQuery({
    queryKey: ["admin", "template-categories"],
    queryFn: () => apiGet<PromptTemplateCategoryPublic[]>("/api/admin/templates/categories"),
  });

  const extract = useMutation({
    mutationFn: (draft: ExtractDraft) =>
      apiPost("/api/admin/templates/extract-from-chat", {
        sessionId: draft.sessionId,
        messageId: draft.messageId,
        generationJobId: draft.generationJobId,
        type: draft.type,
        status: draft.status,
        title: draft.title,
        category: draft.category || undefined,
        tags: draft.tagsText
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "templates"] });
      setExtractDraft(null);
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : t("page.userChats.extractFailed")),
  });

  const openSession = (id: string) => {
    setSelectedSessionId(id);
    navigate({ to: "/admin/user-chats", search: { sessionId: id }, replace: true });
  };

  const closeSession = () => {
    setSelectedSessionId(null);
    navigate({ to: "/admin/user-chats", search: {}, replace: true });
  };

  const columns: Column<AdminChatRow>[] = [
    {
      header: t("page.userChats.session"),
      cell: (row) => (
        <div>
          <div className="font-medium">{row.title}</div>
          <div className="text-xs text-muted-foreground">{row.id}</div>
        </div>
      ),
      className: "max-w-sm",
    },
    {
      header: t("common.user"),
      cell: (row) => (
        <div>
          <div className="font-medium">{row.user.profile?.displayName ?? row.user.email}</div>
          <div className="text-xs text-muted-foreground">{row.user.email}</div>
        </div>
      ),
    },
    { header: t("page.userChats.messages"), cell: (row) => row._count?.messages ?? 0 },
    { header: t("page.userChats.generations"), cell: (row) => row._count?.jobs ?? 0 },
    { header: t("common.updated"), cell: (row) => formatDateTime(row.updatedAt) },
    {
      header: "",
      cell: (row) => (
        <Button size="sm" variant="outline" onClick={() => openSession(row.id)}>
          {t("page.userChats.viewDetail")}
        </Button>
      ),
    },
  ];

  const detail = detailQ.data;
  const rows = chatsQ.data?.items ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t("page.userChats.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("page.userChats.description")}</p>
      </header>

      <div className="grid gap-3 rounded-lg border border-border bg-background/40 p-4 md:grid-cols-[minmax(220px,1fr)_minmax(220px,320px)_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            placeholder={t("page.userChats.search")}
            className="bg-secondary/40 pl-9"
          />
        </div>
        <Input
          value={userId}
          onChange={(event) => {
            setUserId(event.target.value);
            setPage(1);
          }}
          placeholder={t("page.userChats.userId")}
          className="bg-secondary/40"
        />
        <Button
          variant="outline"
          disabled={!q && !userId}
          onClick={() => {
            setQ("");
            setUserId("");
            setPage(1);
          }}
        >
          {t("common.reset")}
        </Button>
      </div>

      <AdminTable
        rows={rows}
        columns={columns}
        loading={chatsQ.isLoading}
        empty={t("page.userChats.empty")}
        rowKey={(row) => row.id}
        pagination={{
          page: chatsQ.data?.page ?? page,
          pageSize: chatsQ.data?.pageSize ?? pageSize,
          pageCount: Math.max(chatsQ.data?.pageCount ?? 1, 1),
          total: chatsQ.data?.total ?? rows.length,
          itemCount: rows.length,
          hasNextPage: chatsQ.data?.hasNextPage ?? false,
          hasPreviousPage: chatsQ.data?.hasPreviousPage ?? page > 1,
          onPageChange: setPage,
          onPageSizeChange: (size) => {
            setPageSize(size);
            setPage(1);
          },
        }}
      />

      <Dialog open={!!selectedSessionId} onOpenChange={(open) => !open && closeSession()}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogTitle>{detail?.title ?? t("page.userChats.detail")}</DialogTitle>
          {detailQ.isLoading ? (
            <div className="text-sm text-muted-foreground">{t("common.loading")}</div>
          ) : detail ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{detail.user.email}</span>
                <span>·</span>
                <span>{formatDateTime(detail.updatedAt)}</span>
                {detail.archived ? <Badge variant="secondary">ARCHIVED</Badge> : null}
              </div>
              <div className="space-y-4">
                {detail.messages.map((message) => (
                  <MessageBlock
                    key={message.id}
                    message={message}
                    onExtract={(type) =>
                      setExtractDraft({
                        sessionId: detail.id,
                        messageId: message.id,
                        generationJobId:
                          message.generationJob?.id ?? message.generationJobId ?? undefined,
                        type,
                        status: "DRAFT",
                        title: titleFromPrompt(message.content),
                        category: "",
                        tagsText: "",
                      })
                    }
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">{t("page.userChats.notFound")}</div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!extractDraft} onOpenChange={(open) => !open && setExtractDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{t("page.templates.extractTitle")}</DialogTitle>
          {extractDraft ? (
            <div className="grid gap-3">
              <Field label={t("common.title")}>
                <Input
                  value={extractDraft.title}
                  onChange={(event) =>
                    setExtractDraft({ ...extractDraft, title: event.target.value })
                  }
                />
              </Field>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label={t("common.type")}>
                  <select
                    value={extractDraft.type}
                    onChange={(event) =>
                      setExtractDraft({
                        ...extractDraft,
                        type: event.target.value as GenerationJobType,
                      })
                    }
                    className="h-9 rounded-md border border-border bg-background/40 px-3 text-sm"
                  >
                    <option value="TEXT2IMAGE">{t("nav.imageTemplates")}</option>
                    <option value="IMAGE2VIDEO">{t("nav.videoTemplates")}</option>
                  </select>
                </Field>
                <Field label={t("common.status")}>
                  <select
                    value={extractDraft.status}
                    onChange={(event) =>
                      setExtractDraft({
                        ...extractDraft,
                        status: event.target.value as PromptTemplateStatus,
                      })
                    }
                    className="h-9 rounded-md border border-border bg-background/40 px-3 text-sm"
                  >
                    <option value="DRAFT">DRAFT</option>
                    <option value="PUBLISHED">PUBLISHED</option>
                  </select>
                </Field>
              </div>
              <Field label={t("common.category")}>
                <select
                  value={extractDraft.category}
                  onChange={(event) =>
                    setExtractDraft({ ...extractDraft, category: event.target.value })
                  }
                  className="h-9 rounded-md border border-border bg-background/40 px-3 text-sm"
                >
                  <option value="">{t("page.templates.uncategorized")}</option>
                  {(categoriesQ.data ?? []).map((item) => (
                    <option key={item.id} value={item.name}>
                      {item.isActive
                        ? item.name
                        : t("page.templates.disabledCategory", { name: item.name })}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("common.tags")}>
                <Input
                  value={extractDraft.tagsText}
                  onChange={(event) =>
                    setExtractDraft({ ...extractDraft, tagsText: event.target.value })
                  }
                  placeholder={t("page.templates.tagsPlaceholder")}
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setExtractDraft(null)}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={() => extract.mutate(extractDraft)} disabled={extract.isPending}>
                  {t("page.templates.createTemplate")}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MessageBlock({
  message,
  onExtract,
}: {
  message: AdminChatDetail["messages"][number];
  onExtract: (type: GenerationJobType) => void;
}) {
  const { t } = useAdminI18n();
  const refs = Array.isArray(message.metadata?.refs)
    ? (message.metadata.refs as Array<{ id?: string; src?: string; name?: string }>).filter(
        (ref) => ref.src,
      )
    : [];
  const job = message.generationJob;
  const hasOutputs = Boolean(job?.outputAssets?.length || job?.outputUrls?.length);
  const settingsMode = (message.metadata?.settings as { mode?: string } | undefined)?.mode;
  const inferredType: GenerationJobType =
    job?.type ?? (settingsMode === "video" ? "IMAGE2VIDEO" : "TEXT2IMAGE");

  return (
    <div className="rounded-lg border border-border bg-background/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant={message.role === "user" ? "default" : "secondary"}>
              {message.role}
            </Badge>
            {job ? <Badge variant="outline">{job.status}</Badge> : null}
            {job ? <code className="text-xs text-muted-foreground">{job.modelCode}</code> : null}
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => onExtract(inferredType)}>
          <Sparkles className="mr-1.5 h-4 w-4" />
          {t("page.templates.extract")}
        </Button>
      </div>

      {refs.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {refs.map((ref, index) => (
            <img
              key={ref.id ?? index}
              src={ref.src}
              alt={ref.name ?? "reference"}
              className="h-16 w-16 rounded-md border border-border object-cover"
            />
          ))}
        </div>
      ) : null}

      {hasOutputs ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(job?.outputAssets ?? []).map((asset) =>
            asset.contentType.startsWith("video/") ? (
              <video
                key={asset.id}
                src={asset.url ?? undefined}
                controls
                className="aspect-video w-full rounded-md border border-border object-cover"
              />
            ) : (
              <img
                key={asset.id}
                src={asset.url ?? ""}
                alt={asset.key}
                className="aspect-video w-full rounded-md border border-border object-cover"
              />
            ),
          )}
          {!job?.outputAssets?.length
            ? job?.outputUrls.map((url) => (
                <img
                  key={url}
                  src={url}
                  alt="generated"
                  className="aspect-video w-full rounded-md border border-border object-cover"
                />
              ))
            : null}
        </div>
      ) : null}

      {job?.errorMessage ? (
        <p className="mt-2 text-xs text-destructive">{job.errorMessage}</p>
      ) : null}
      {job?.prompt && job.prompt !== message.content ? (
        <details className="mt-3 text-xs text-muted-foreground">
          <summary className="cursor-pointer">{t("page.templates.finalPrompt")}</summary>
          <pre className="mt-2 whitespace-pre-wrap rounded-md bg-secondary/40 p-2">
            {job.prompt}
          </pre>
        </details>
      ) : null}
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

function titleFromPrompt(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 36 ? `${compact.slice(0, 36)}...` : compact || "Untitled template";
}
