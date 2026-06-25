import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Clock3, MessageSquare, MoreHorizontal } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { apiGet, apiPatch } from "@/lib/api-client";
import { displayChatTitle, persistedChatTitle } from "@/lib/chat-title";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { modeForChatSession, studioPathForChatSession, type ChatSession, type StudioMode } from "./-dashboard-types";
import { PanelHeader, LoadingRows, EmptyState, formatDateTime } from "./-dashboard-components";
import { getInitialLocale, translate, useI18n } from "@/lib/i18n";

type ChatTypeFilter = "all" | StudioMode;

export const Route = createFileRoute("/dashboard/chats")({
  head: () => ({
    meta: [
      { title: translate(getInitialLocale(), "chats.meta.title") },
      { name: "description", content: translate(getInitialLocale(), "chats.meta.description") },
    ],
  }),
  component: ChatsRoute,
});

function ChatsRoute() {
  const { user } = useAuth();
  const chatsQ = useQuery({
    queryKey: ["dashboard", "chats"],
    queryFn: () => apiGet<ChatSession[]>("/api/chats"),
    enabled: !!user,
  });

  return <ChatsPanel chats={chatsQ.data ?? []} loading={chatsQ.isLoading} />;
}

function ChatsPanel({ chats, loading }: { chats: ChatSession[]; loading: boolean }) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<ChatTypeFilter>("all");
  const filteredChats =
    typeFilter === "all"
      ? chats
      : chats.filter((chat) => modeForChatSession(chat) === typeFilter);

  const handleRename = async (e: { preventDefault: () => void }, id: string, currentTitle: string) => {
    e.preventDefault();
    const title = window.prompt(t("chats.renamePrompt"), displayChatTitle(currentTitle, t));
    if (!title) return;
    try {
      await apiPatch(`/api/chats/${id}`, { title: persistedChatTitle(title) });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "chats"] });
    } catch (err) {
      toast.error(t("chats.renameFailed"));
    }
  };

  const handlePin = async (e: { preventDefault: () => void }, id: string, currentPinned: boolean) => {
    e.preventDefault();
    try {
      await apiPatch(`/api/chats/${id}`, { pinned: !currentPinned });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "chats"] });
    } catch (err) {
      toast.error(t("chats.pinFailed"));
    }
  };

  const handleDelete = async (e: { preventDefault: () => void }, id: string) => {
    e.preventDefault();
    if (!window.confirm(t("chats.deleteConfirm"))) return;
    try {
      await apiPatch(`/api/chats/${id}/archive`, {});
      queryClient.invalidateQueries({ queryKey: ["dashboard", "chats"] });
    } catch (err) {
      toast.error(t("chats.deleteFailed"));
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card">
      <PanelHeader
        title={t("chats.title")}
        description={t("chats.description")}
        action={
          <Button asChild className="bg-gradient-primary">
            <Link to="/dashboard/studio/image">
              {t("chats.new")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        }
      />
      <div className="p-5">
        {loading ? (
          <LoadingRows />
        ) : chats.length === 0 ? (
          <EmptyState title={t("chats.empty.title")} detail={t("chats.empty.detail")} />
        ) : (
          <div className="space-y-4">
            <Tabs value={typeFilter} onValueChange={(value) => setTypeFilter(value as ChatTypeFilter)}>
              <TabsList className="grid w-full grid-cols-3 sm:w-auto">
                <TabsTrigger value="all">{t("chats.tab.all")}</TabsTrigger>
                <TabsTrigger value="image">{t("chats.tab.image")}</TabsTrigger>
                <TabsTrigger value="video">{t("chats.tab.video")}</TabsTrigger>
              </TabsList>
            </Tabs>
            {filteredChats.length === 0 ? (
              <EmptyState title={t("chats.empty.filteredTitle")} detail={t("chats.empty.filteredDetail")} />
            ) : (
              <div className="grid gap-3">
                {filteredChats.map((chat) => {
                  const chatMode = modeForChatSession(chat);
                  const chatTitle = displayChatTitle(chat.title, t);
                  return (
                    <Link
                      key={chat.id}
                      to={studioPathForChatSession(chat)}
                      search={{ sessionId: chat.id }}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/35 p-4 transition hover:bg-secondary/30"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                          <MessageSquare className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium">{chatTitle}</p>
                            <Badge variant="outline">
                              {chatMode === "video" ? t("chats.badge.video") : t("chats.badge.image")}
                            </Badge>
                            {chat.pinned ? <Badge variant="secondary">{t("chats.pinnedBadge")}</Badge> : null}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t("chats.stats", {
                              messages: chat._count?.messages ?? 0,
                              jobs: chat._count?.jobs ?? 0,
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock3 className="h-3.5 w-3.5" />
                          {formatDateTime(chat.updatedAt, locale)}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.preventDefault()}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => handleRename(e, chat.id, chat.title)}>
                              {t("chats.rename")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => handlePin(e, chat.id, chat.pinned)}>
                              {chat.pinned ? t("chats.unpin") : t("chats.pin")}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => handleDelete(e, chat.id)}>
                              {t("common.delete")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
