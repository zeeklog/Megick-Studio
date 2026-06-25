"use client";

import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import type { ChatSessionDetail } from "@/routes/-dashboard-types";
import type { StudioResultActionPayload } from "@/routes/-studio-panel";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/megickcut/components/ui/resizable";
import { AssetsPanel } from "@/megickcut/components/editor/panels/assets";
import { SessionImportDialog } from "@/megickcut/components/editor/panels/assets/views/assets";
import { PropertiesPanel } from "@/megickcut/components/editor/panels/properties";
import { Timeline } from "@/megickcut/timeline/components";
import { PreviewPanel } from "@/megickcut/preview/components";
import { EditorHeader } from "@/megickcut/components/editor/editor-header";
import { EditorProvider } from "@/megickcut/components/providers/editor-provider";
import { Onboarding } from "@/megickcut/components/editor/onboarding";
import { MigrationDialog } from "@/megickcut/project/components/migration-dialog";
import { usePanelStore } from "@/megickcut/editor/panel-store";
import { usePasteMedia } from "@/megickcut/media/use-paste-media";
import { MobileGate } from "@/megickcut/components/editor/mobile-gate";
import { useEditor } from "@/megickcut/editor/use-editor";
import { Button } from "@/megickcut/components/ui/button";
import { TooltipProvider } from "@/megickcut/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StoragePersistenceDialog } from "@/megickcut/services/storage/components/storage-persistence-dialog";
import {
  createPreviewOverlayControl,
  isPreviewOverlayVisible,
  mergePreviewOverlaySources,
} from "@/megickcut/preview/overlays";
import { usePreviewStore } from "@/megickcut/preview/preview-store";
import { getGuidePreviewOverlaySource } from "@/megickcut/guides";
import {
  bookmarkNotesPreviewOverlay,
  getBookmarkPreviewOverlaySource,
} from "@/megickcut/timeline/bookmarks/index";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getInitialLocale, translate, useI18n, type TranslationKey } from "@/lib/i18n";
import { displayChatTitle } from "@/lib/chat-title";
import { MegickEditorContextProvider } from "@/megickcut/integration/editor-context";
import { useAssetsPanelStore } from "@/megickcut/components/editor/panels/assets/assets-panel-store";
import {
  createSessionMediaItem,
  findSessionMediaByResultId,
  importSessionMediaItem,
  studioMediaSourceKey,
} from "@/megickcut/integration/session-media";
import { cn } from "@/lib/utils";

const EmbeddedStudioPage = lazy(async () => {
  const mod = await import("@/routes/-studio-panel");
  return { default: mod.StudioPage };
});

// ─── Public shell component ────────────────────────────────────────

export function MegickCutEditorShell({
  sessionId,
  sessionTitle,
  sourceSessionId,
  sourceMessageId,
  sourceResultId,
  embedded = false,
  returnTo,
}: {
  sessionId: string;
  sessionTitle: string;
  sourceSessionId?: string;
  sourceMessageId?: string;
  sourceResultId?: string;
  embedded?: boolean;
  returnTo?: () => void;
}) {
  const { t } = useI18n();
  const [sessionImportOpen, setSessionImportOpen] = useState(false);
  const [aiStudioOpen, setAiStudioOpen] = useState(false);

  const contextValue = useMemo(
    () => ({
      sessionId,
      sessionTitle: sessionTitle
        ? displayChatTitle(sessionTitle, t)
        : t("editor.project.defaultName"),
      sourceMessageId,
      sourceResultId,
      returnToStudio: embedded ? undefined : (returnTo ?? (() => {})),
    }),
    [sessionId, sessionTitle, sourceMessageId, sourceResultId, returnTo, embedded, t],
  );

  // Warn on tab close / refresh while editor is open
  useEffect(() => {
    if (!embedded) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [embedded]);

  return (
    <MegickEditorContextProvider value={contextValue}>
      <TooltipProvider delayDuration={200}>
        <MobileGate embedded={embedded}>
          <EditorProvider projectId={sessionId} projectName={sessionTitle} embedded={embedded}>
            {sourceMessageId && sourceResultId ? (
              <AutoImportByResultId
                sourceSessionId={sourceSessionId ?? sessionId}
                sourceMessageId={sourceMessageId}
                sourceResultId={sourceResultId}
              />
            ) : null}
            <div
              className={cn(
                "megick-editor-shell flex flex-col overflow-hidden bg-background text-foreground",
                embedded ? "h-full w-full rounded-lg border border-border" : "h-screen w-screen",
              )}
            >
              <DegradedRendererBanner />
              <EditorHeader />
              <div className="min-h-0 min-w-0 flex-1">
                <EditorLayout
                  onImportFromSession={() => setSessionImportOpen(true)}
                  onOpenAiStudio={() => setAiStudioOpen(true)}
                />
              </div>
              <Onboarding />
              <SessionImportDialogHost
                open={sessionImportOpen}
                onOpenChange={setSessionImportOpen}
              />
              <AiVideoStudioDialogHost
                open={aiStudioOpen}
                onOpenChange={setAiStudioOpen}
                sessionId={sessionId}
                sessionTitle={sessionTitle}
              />
              <MigrationDialog />
              <StoragePersistenceDialog />
            </div>
          </EditorProvider>
        </MobileGate>
      </TooltipProvider>
    </MegickEditorContextProvider>
  );
}

// ─── Loading ───────────────────────────────────────────────────────

export function EditorLoading({ labelKey }: { labelKey: TranslationKey }) {
  const { t } = useI18n();
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="size-6 animate-spin text-primary" />
        {t(labelKey)}
      </div>
    </div>
  );
}

// ─── Internal helpers ──────────────────────────────────────────────

function AiVideoStudioDialogHost({
  open,
  onOpenChange,
  sessionId,
  sessionTitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  sessionTitle: string;
}) {
  const editor = useEditor();
  const { t } = useI18n();
  const activeProject = useEditor((e) => e.project.getActive());

  const handleResultAction = async ({
    sessionId: resultSessionId,
    sessionTitle: resultSessionTitle,
    messageId,
    result,
  }: StudioResultActionPayload) => {
    const item = createSessionMediaItem({
      sessionId: resultSessionId,
      sessionTitle: resultSessionTitle || sessionTitle,
      messageId,
      result,
    });
    const asset = await importSessionMediaItem({
      editor,
      projectId: activeProject.metadata.id,
      item,
      insertOnTimeline: false,
    });
    if (asset) {
      toast.success(t("editor.ai.imported"));
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[92vh] max-h-[92vh] w-[calc(100vw-2rem)] max-w-[1180px] overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border">
          <DialogTitle>{t("editor.ai.title")}</DialogTitle>
          <DialogDescription>{t("editor.ai.description")}</DialogDescription>
        </DialogHeader>
        <div
          className={cn("min-h-0 flex-1 overflow-hidden px-4 pb-4", "[&_button]:cursor-pointer")}
        >
          <Suspense
            fallback={
              <div className="flex min-h-[520px] items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                {t("editor.loading.aiStudio")}
              </div>
            }
          >
            <EmbeddedStudioPage
              mode="video"
              search={{ sessionId }}
              embedded
              resultActionLabel={t("editor.ai.importAction")}
              onResultAction={handleResultAction}
            />
          </Suspense>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SessionImportDialogHost({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const activeProject = useEditor((e) => e.project.getActive());
  const mediaFiles = useEditor((e) => e.media.getAssets());

  const existingSourceKeys = useMemo(
    () =>
      new Set(
        mediaFiles
          .map((item) => item.sourceKey)
          .filter((sourceKey): sourceKey is string => Boolean(sourceKey)),
      ),
    [mediaFiles],
  );

  return (
    <SessionImportDialog
      open={open}
      onOpenChange={onOpenChange}
      activeProjectId={activeProject.metadata.id}
      existingSourceKeys={existingSourceKeys}
    />
  );
}

function AutoImportByResultId({
  sourceSessionId,
  sourceMessageId,
  sourceResultId,
}: {
  sourceSessionId: string;
  sourceMessageId: string;
  sourceResultId: string;
}) {
  const editor = useEditor();
  const { t } = useI18n();
  const activeProject = useEditor((e) => e.project.getActive());
  const {
    beginPendingMediaImport,
    completePendingMediaImport,
    failPendingMediaImport,
    requestRevealMedia,
  } = useAssetsPanelStore();
  const importedSourceRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeProject) return;
    const importKey = `${sourceSessionId}:${sourceMessageId}:${sourceResultId}`;
    if (importedSourceRef.current === importKey) return;
    importedSourceRef.current = importKey;

    const doImport = async () => {
      const sourceKey = studioMediaSourceKey({
        sessionId: sourceSessionId,
        messageId: sourceMessageId,
        resultId: sourceResultId,
      });
      const existing = editor.media.getAssets().find((asset) => asset.sourceKey === sourceKey);

      if (existing) {
        completePendingMediaImport(sourceKey);
        requestRevealMedia(existing.id);
        return;
      }

      beginPendingMediaImport({
        sourceKey,
        kind: "video",
        name: t("editor.assets.pendingImport.generatedVideo"),
      });

      try {
        const { getStudioSession } = await import("@/megickcut/integration/session-media");
        const session = await getStudioSession({ sessionId: sourceSessionId });
        const item = findSessionMediaByResultId({
          session,
          messageId: sourceMessageId,
          resultId: sourceResultId,
        });
        if (!item) {
          const message = t("editor.autoImport.notFound");
          failPendingMediaImport(sourceKey, message);
          toast.error(message);
          return;
        }
        if (item.kind !== "video") {
          const message = t("editor.autoImport.videoOnly");
          failPendingMediaImport(sourceKey, message);
          toast.error(message);
          return;
        }
        beginPendingMediaImport({
          sourceKey,
          kind: item.kind,
          name: item.prompt || t("editor.assets.pendingImport.generatedVideo"),
          prompt: item.prompt,
          sessionTitle: displayChatTitle(item.sessionTitle, t),
        });
        const asset = await importSessionMediaItem({
          editor,
          projectId: activeProject.metadata.id,
          item,
          insertOnTimeline: true,
        });
        if (!asset) {
          const message = t("editor.autoImport.failed");
          failPendingMediaImport(sourceKey, message);
          toast.error(message);
          return;
        }
        completePendingMediaImport(sourceKey);
        requestRevealMedia(asset.id);
        toast.success(t("editor.autoImport.success"));
      } catch (error) {
        importedSourceRef.current = null;
        console.error("Failed to import Studio source:", error);
        const description = error instanceof Error ? error.message : undefined;
        failPendingMediaImport(sourceKey, description ?? t("editor.autoImport.failed"));
        toast.error(t("editor.autoImport.failed"), {
          description,
        });
      }
    };

    void doImport();
  }, [
    activeProject,
    beginPendingMediaImport,
    completePendingMediaImport,
    editor,
    failPendingMediaImport,
    requestRevealMedia,
    sourceSessionId,
    sourceMessageId,
    sourceResultId,
    t,
  ]);

  return null;
}

function DegradedRendererBanner() {
  const isDegraded = useEditor((e) => e.renderer.isDegraded);
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(false);
  if (!isDegraded || dismissed) return null;

  return (
    <div className="flex h-9 items-center justify-center gap-2 border-b bg-accent text-xs text-muted-foreground">
      <span>{t("editor.renderer.chromeTip")}</span>
      <Button
        variant="text"
        size="icon"
        className="w-auto p-0 [&_svg]:size-3.5"
        onClick={() => setDismissed(true)}
        aria-label={t("common.close")}
      >
        <HugeiconsIcon icon={Cancel01Icon} />
      </Button>
    </div>
  );
}

export function EditorLayout({
  onImportFromSession,
  onOpenAiStudio,
}: {
  onImportFromSession: () => void;
  onOpenAiStudio: () => void;
}) {
  usePasteMedia();
  const { panels, setPanel } = usePanelStore();
  const activeScene = useEditor((editor) => editor.scenes.getActiveSceneOrNull());
  const currentTime = useEditor((editor) => editor.playback.getCurrentTime());
  const activeGuide = usePreviewStore((state) => state.activeGuide);
  const overlays = usePreviewStore((state) => state.overlays);
  const setOverlayVisibility = usePreviewStore((state) => state.setOverlayVisibility);
  const showBookmarkNotes = isPreviewOverlayVisible({
    overlay: bookmarkNotesPreviewOverlay,
    overlays,
  });

  const overlaySource = useMemo(
    () =>
      mergePreviewOverlaySources({
        sources: [
          getGuidePreviewOverlaySource({ guideId: activeGuide }),
          activeScene
            ? getBookmarkPreviewOverlaySource({
                bookmarks: activeScene.bookmarks,
                time: currentTime,
                isVisible: showBookmarkNotes,
              })
            : {
                definitions: [bookmarkNotesPreviewOverlay],
                instances: [],
              },
        ],
      }),
    [activeGuide, activeScene, currentTime, showBookmarkNotes],
  );

  const overlayControls = useMemo(
    () =>
      overlaySource.definitions.map((overlay) =>
        createPreviewOverlayControl({ overlay, overlays }),
      ),
    [overlaySource.definitions, overlays],
  );

  return (
    <ResizablePanelGroup
      direction="vertical"
      className="size-full gap-[0.18rem]"
      onLayout={(sizes) => {
        setPanel({ panel: "mainContent", size: sizes[0] ?? panels.mainContent });
        setPanel({ panel: "timeline", size: sizes[1] ?? panels.timeline });
      }}
    >
      <ResizablePanel
        defaultSize={panels.mainContent}
        minSize={30}
        maxSize={85}
        className="min-h-0"
      >
        <ResizablePanelGroup
          direction="horizontal"
          className="size-full gap-[0.19rem] px-3"
          onLayout={(sizes) => {
            setPanel({ panel: "tools", size: sizes[0] ?? panels.tools });
            setPanel({ panel: "preview", size: sizes[1] ?? panels.preview });
            setPanel({ panel: "properties", size: sizes[2] ?? panels.properties });
          }}
        >
          <ResizablePanel defaultSize={panels.tools} minSize={24} maxSize={40} className="min-w-0">
            <AssetsPanel
              onImportFromSession={onImportFromSession}
              onOpenAiStudio={onOpenAiStudio}
            />
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel
            defaultSize={panels.preview}
            minSize={30}
            className="min-h-0 min-w-0 flex-1"
          >
            <PreviewPanel
              overlayControls={overlayControls}
              overlayInstances={overlaySource.instances}
              onOverlayVisibilityChange={setOverlayVisibility}
            />
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel
            defaultSize={panels.properties}
            minSize={15}
            maxSize={40}
            className="min-w-0"
          >
            <PropertiesPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel
        defaultSize={panels.timeline}
        minSize={15}
        maxSize={70}
        className="min-h-0 px-3 pb-3"
      >
        <Timeline />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
