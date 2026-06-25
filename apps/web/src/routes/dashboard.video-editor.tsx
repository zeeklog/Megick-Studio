import { createFileRoute, useNavigate, useBlocker } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuthGate } from "@/hooks/useAuthGate";
import { apiPost } from "@/lib/api-client";
import { displayChatTitle } from "@/lib/chat-title";
import type { ChatSession } from "@/routes/-dashboard-types";
import { translate, getInitialLocale, useI18n } from "@/lib/i18n";
import { asSearchRecord, optionalString } from "@/lib/search-params";
import { noIndexHead } from "@/lib/seo";
import { toast } from "sonner";
import { MegickCutEditorShell } from "@/megickcut/integration/editor-shell";

function videoEditorSearchSchema(input: unknown): {
  sourceSessionId?: string;
  sourceMessageId?: string;
  sourceResultId?: string;
} {
  const search = asSearchRecord(input);
  return {
    sourceSessionId: optionalString(search.sourceSessionId),
    sourceMessageId: optionalString(search.sourceMessageId),
    sourceResultId: optionalString(search.sourceResultId),
  };
}

export const Route = createFileRoute("/dashboard/video-editor")({
  head: () =>
    noIndexHead({
      title: translate(getInitialLocale(), "dashboard.nav.videoEditor.label"),
      description: translate(getInitialLocale(), "dashboard.nav.videoEditor.description"),
    }),
  validateSearch: videoEditorSearchSchema,
  component: VideoEditorGateway,
});

function VideoEditorGateway() {
  const auth = useAuthGate();
  const navigate = useNavigate();
  const { t } = useI18n();
  const search = Route.useSearch();
  const creatingRef = useRef(false);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [error, setError] = useState(false);

  // Navigation blocker: warn when leaving editor
  const blocker = useBlocker({
    condition: !!session,
    blockerFn: () => !window.confirm(t("editor.unsavedWarning") ?? "Leave without saving?"),
  });

  useEffect(() => {
    if (!auth.loading && !auth.user) {
      auth.requireAuth();
      return;
    }
    if (!auth.user || creatingRef.current || session || error) return;
    creatingRef.current = true;

    apiPost<ChatSession>("/api/chats", {
      title: translate(getInitialLocale(), "dashboard.nav.videoEditor.label"),
    })
      .then((s) => {
        apiPost(`/api/chats/${s.id}/messages`, {
          role: "system",
          content: "Video editor session",
          metadata: { settings: { mode: "video" } },
        }).catch(() => undefined);
        setSession(s);
      })
      .catch((err) => {
        setError(true);
        toast.error(t("studio.createConversationFailed"), {
          description: err instanceof Error ? err.message : undefined,
        });
      });
  }, [auth.loading, auth.requireAuth, auth.user, navigate, t, session, error]);

  if (auth.loading || (!session && !error)) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t("studio.openingConversation")}</p>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">{t("studio.createConversationFailed")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0">
      <MegickCutEditorShell
        sessionId={session.id}
        sessionTitle={displayChatTitle(session.title, t)}
        sourceSessionId={search.sourceSessionId}
        sourceMessageId={search.sourceMessageId}
        sourceResultId={search.sourceResultId}
        embedded
        returnTo={() => {
          // Inside dashboard, no explicit return – the sidebar handles navigation
        }}
      />
    </div>
  );
}
