import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { ModelProviderAdmin, ModelProviderApiStyle } from "@megick/api-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AdminTable, useAdminClientPagination, type Column } from "@/components/admin/AdminTable";
import { apiDelete, apiGet, apiPost } from "@/lib/api-client";
import { useAdminI18n } from "@/lib/admin-i18n";

export const Route = createFileRoute("/admin/model-providers")({
  component: AdminModelProviders,
});

type ProviderDraft = ModelProviderAdmin & { apiKey?: string };

const emptyProvider: ProviderDraft = {
  id: "",
  code: "magickapi",
  name: "MagickAPI",
  baseUrl: "https://api.magickapi.com",
  apiStyle: "OPENAI",
  statusUrl: "",
  maxPollDurationMs: 900000,
  pollIntervalMs: 5000,
  maxPollAttempts: 180,
  extra: {},
  hasApiKey: false,
  isActive: true,
  sortOrder: 0,
};

function AdminModelProviders() {
  const { t } = useAdminI18n();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ProviderDraft | null>(null);

  const providersQ = useQuery({
    queryKey: ["admin", "model-providers"],
    queryFn: () => apiGet<ModelProviderAdmin[]>("/api/admin/model-providers"),
  });

  const upsert = useMutation({
    mutationFn: (input: ProviderDraft) => apiPost("/api/admin/model-providers", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "model-providers"] });
      setEditing(null);
      toast.success(t("page.modelProviders.saved"));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: (code: string) => apiDelete(`/api/admin/model-providers/${encodeURIComponent(code)}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "model-providers"] }),
  });

  const table = useAdminClientPagination(providersQ.data ?? []);
  const columns: Column<ModelProviderAdmin>[] = [
    { header: "Code", cell: (provider) => <code>{provider.code}</code> },
    { header: t("common.name"), cell: (provider) => provider.name },
    { header: "Style", cell: (provider) => provider.apiStyle },
    { header: "Base URL", cell: (provider) => provider.baseUrl },
    { header: t("common.token"), cell: (provider) => (provider.hasApiKey ? t("common.configured") : t("common.missing")) },
    { header: t("common.active"), cell: (provider) => (provider.isActive ? "✓" : "—") },
    {
      header: "",
      cell: (provider) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing({ ...provider, apiKey: undefined })}>
            {t("common.edit")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => window.confirm(`Delete ${provider.code}?`) && remove.mutate(provider.code)}
          >
            {t("common.delete")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("page.modelProviders.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("page.modelProviders.description")}</p>
        </div>
        <Button onClick={() => setEditing(emptyProvider)}>{t("common.create")}</Button>
      </header>

      <AdminTable
        rows={table.rows}
        columns={columns}
        loading={providersQ.isLoading}
        rowKey={(provider) => provider.id || provider.code}
        empty={t("common.empty")}
        pagination={table.pagination}
      />

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogTitle>{editing?.id ? t("page.modelProviders.editTitle") : t("page.modelProviders.newTitle")}</DialogTitle>
          {editing ? (
            <div className="grid gap-3">
              <Field label="Code">
                <Input value={editing.code} onChange={(event) => setEditing({ ...editing, code: event.target.value })} />
              </Field>
              <Field label={t("common.name")}>
                <Input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
              </Field>
              <Field label="Base URL">
                <Input
                  value={editing.baseUrl}
                  onChange={(event) => setEditing({ ...editing, baseUrl: event.target.value })}
                  placeholder="https://api.magickapi.com"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="API Style">
                  <select
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    value={editing.apiStyle ?? "OPENAI"}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        apiStyle: event.target.value as ModelProviderApiStyle,
                      })
                    }
                  >
                    <option value="OPENAI">OPENAI</option>
                    <option value="CREX">CREX</option>
                    <option value="VOLCENGINE">VOLCENGINE</option>
                  </select>
                </Field>
                <Field label="Status URL">
                  <Input
                    value={editing.statusUrl ?? ""}
                    onChange={(event) =>
                      setEditing({ ...editing, statusUrl: event.target.value })
                    }
                    placeholder="https://bpi.crex.cn/v1/images/tasks/{taskId}"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Max Poll Ms">
                  <Input
                    type="number"
                    value={editing.maxPollDurationMs ?? 900000}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        maxPollDurationMs: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Poll Ms">
                  <Input
                    type="number"
                    value={editing.pollIntervalMs ?? 5000}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        pollIntervalMs: Number(event.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Poll Attempts">
                  <Input
                    type="number"
                    value={editing.maxPollAttempts ?? 180}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        maxPollAttempts: Number(event.target.value),
                      })
                    }
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("common.sort")}>
                  <Input
                    type="number"
                    value={editing.sortOrder}
                    onChange={(event) => setEditing({ ...editing, sortOrder: Number(event.target.value) })}
                  />
                </Field>
                <Field label={t("common.active")}>
                  <label className="flex h-9 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editing.isActive}
                      onChange={(event) => setEditing({ ...editing, isActive: event.target.checked })}
                    />
                    {t("common.enabled")}
                  </label>
                </Field>
              </div>
              <Field label={t("page.modelProviders.apiKey")}>
                <Input
                  type="password"
                  value={editing.apiKey ?? ""}
                  onChange={(event) => setEditing({ ...editing, apiKey: event.target.value })}
                  placeholder={editing.hasApiKey ? t("common.configured") : "sk-..."}
                />
              </Field>
              <Field label={t("page.modelProviders.extra")}>
                <Textarea
                  rows={5}
                  value={JSON.stringify(editing.extra ?? {}, null, 2)}
                  onChange={(event) => {
                    try {
                      setEditing({ ...editing, extra: JSON.parse(event.target.value || "{}") });
                    } catch {
                      // Keep the last valid JSON while the admin is typing.
                    }
                  }}
                />
              </Field>
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={() => upsert.mutate(editing)}>{t("common.save")}</Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
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
