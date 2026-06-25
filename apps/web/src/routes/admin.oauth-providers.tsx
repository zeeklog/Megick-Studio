import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AdminTable, useAdminClientPagination, type Column } from "@/components/admin/AdminTable";
import { apiGet, apiPost } from "@/lib/api-client";
import { useAdminI18n } from "@/lib/admin-i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/oauth-providers")({
  component: AdminOAuthProviders,
});

interface ProviderRow {
  id: string;
  provider: "GOOGLE" | "GITHUB" | "APPLE";
  clientId: string;
  redirectUri: string;
  scopes: string[];
  extra: Record<string, unknown>;
  isActive: boolean;
  hasSecret: boolean;
}

interface EditState {
  provider: ProviderRow["provider"];
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scopes: string[];
  isActive: boolean;
  extraJson: string;
}

const providerPresets: Record<ProviderRow["provider"], { redirectPath: string; scopes: string[] }> =
  {
    GOOGLE: { redirectPath: "/api/auth/google/callback", scopes: ["openid", "email", "profile"] },
    GITHUB: { redirectPath: "/api/auth/github/callback", scopes: ["read:user", "user:email"] },
    APPLE: { redirectPath: "/api/auth/apple/callback", scopes: ["name", "email"] },
  };

function sameScopes(left: string[], right: string[]) {
  return left.length === right.length && left.every((scope, idx) => scope === right[idx]);
}

function AdminOAuthProviders() {
  const { t } = useAdminI18n();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<EditState | null>(null);

  const providersQ = useQuery({
    queryKey: ["admin", "oauth-providers"],
    queryFn: () => apiGet<ProviderRow[]>("/api/admin/oauth-providers"),
  });

  const upsert = useMutation({
    mutationFn: (input: EditState & { extra?: Record<string, unknown> }) => {
      let extra: Record<string, unknown> = {};
      try {
        extra = input.extraJson ? JSON.parse(input.extraJson) : {};
      } catch (e) {
        throw new Error(t("page.oauth.invalidJson", { message: (e as Error).message }));
      }
      const payload = { ...input, extra } as unknown as Record<string, unknown>;
      delete (payload as { extraJson?: string }).extraJson;
      return apiPost("/api/admin/oauth-providers", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "oauth-providers"] });
      setEditing(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const rows = providersQ.data ?? [];
  const table = useAdminClientPagination(rows);

  const columns: Column<ProviderRow>[] = [
    { header: t("common.provider"), cell: (p) => p.provider },
    {
      header: t("common.clientId"),
      cell: (p) => <code className="text-xs">{p.clientId.slice(0, 16)}…</code>,
    },
    { header: t("common.redirect"), cell: (p) => <code className="text-xs">{p.redirectUri}</code> },
    { header: t("common.active"), cell: (p) => (p.isActive ? "✓" : "—") },
    {
      header: "",
      cell: (p) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            setEditing({
              provider: p.provider,
              clientId: p.clientId,
              redirectUri: p.redirectUri,
              scopes: p.scopes,
              isActive: p.isActive,
              extraJson: JSON.stringify(p.extra ?? {}, null, 2),
            })
          }
        >
          {t("common.edit")}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("page.oauth.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("page.oauth.description")}</p>
        </div>
        <Button
          onClick={() =>
            setEditing({
              provider: "GOOGLE",
              clientId: "",
              clientSecret: "",
              redirectUri: "/api/auth/google/callback",
              scopes: ["openid", "email", "profile"],
              isActive: true,
              extraJson: "{}",
            })
          }
        >
          {t("page.oauth.new")}
        </Button>
      </header>

      <AdminTable
        rows={table.rows}
        columns={columns}
        loading={providersQ.isLoading}
        rowKey={(p) => p.provider}
        pagination={table.pagination}
      />

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogTitle>{t("page.oauth.editTitle")}</DialogTitle>
          {editing && (
            <div className="grid gap-3">
              <Field label={t("common.provider")}>
                <select
                  className="h-9 w-full rounded-md border border-border bg-background/40 px-2 text-sm"
                  value={editing.provider}
                  onChange={(e) => {
                    const provider = e.target.value as ProviderRow["provider"];
                    const previousPreset = providerPresets[editing.provider];
                    const nextPreset = providerPresets[provider];
                    const shouldReplaceRedirect =
                      !editing.redirectUri || editing.redirectUri === previousPreset.redirectPath;
                    const shouldReplaceScopes =
                      editing.scopes.length === 0 ||
                      sameScopes(editing.scopes, previousPreset.scopes);

                    setEditing({
                      ...editing,
                      provider,
                      redirectUri: shouldReplaceRedirect
                        ? nextPreset.redirectPath
                        : editing.redirectUri,
                      scopes: shouldReplaceScopes ? nextPreset.scopes : editing.scopes,
                    });
                  }}
                >
                  <option value="GOOGLE">GOOGLE</option>
                  <option value="GITHUB">GITHUB</option>
                  <option value="APPLE">APPLE</option>
                </select>
              </Field>
              <Field label={t("common.clientId")}>
                <Input
                  value={editing.clientId}
                  onChange={(e) => setEditing({ ...editing, clientId: e.target.value })}
                />
              </Field>
              <Field label={t("page.oauth.secret")}>
                <Input
                  value={editing.clientSecret ?? ""}
                  onChange={(e) => setEditing({ ...editing, clientSecret: e.target.value })}
                />
              </Field>
              <Field label={t("common.redirect")}>
                <div className="grid gap-1.5">
                  <Input
                    value={editing.redirectUri}
                    onChange={(e) => setEditing({ ...editing, redirectUri: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("page.oauth.redirectHelp", {
                      path: providerPresets[editing.provider].redirectPath,
                    })}
                  </p>
                </div>
              </Field>
              <Field label={t("page.oauth.scopes")}>
                <div className="grid gap-1.5">
                  <Input
                    value={editing.scopes.join(",")}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        scopes: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("page.oauth.suggested", {
                      provider: editing.provider,
                      scopes: providerPresets[editing.provider].scopes.join(","),
                    })}
                  </p>
                  {editing.provider === "GITHUB" ? (
                    <p className="text-xs text-muted-foreground">{t("page.oauth.githubHelp")}</p>
                  ) : null}
                  {editing.provider === "APPLE" ? (
                    <p className="text-xs text-muted-foreground">{t("page.oauth.appleHelp")}</p>
                  ) : null}
                </div>
              </Field>
              <Field label={t("page.oauth.extra")}>
                <Textarea
                  rows={4}
                  value={editing.extraJson}
                  onChange={(e) => setEditing({ ...editing, extraJson: e.target.value })}
                />
              </Field>
              <label className="mt-1 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.isActive}
                  onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
                />{" "}
                {t("common.active")}
              </label>
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>
                  {t("common.cancel")}
                </Button>
                <Button onClick={() => upsert.mutate(editing)}>{t("common.save")}</Button>
              </div>
            </div>
          )}
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
