"use client";

import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { PanelView } from "@/megickcut/components/editor/panels/assets/views/base-panel";
import { MediaDragOverlay } from "@/megickcut/components/editor/panels/assets/drag-overlay";
import { DraggableItem } from "@/megickcut/components/editor/panels/assets/draggable-item";
import { Button } from "@/megickcut/components/ui/button";
import { toast } from "sonner";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/megickcut/components/ui/dialog";
import { ScrollArea } from "@/megickcut/components/ui/scroll-area";
import { Checkbox } from "@/megickcut/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/megickcut/components/ui/context-menu";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/megickcut/timeline/creation";
import { mediaTimeFromSeconds, type MediaTime } from "@/megickcut/wasm";
import { useEditor } from "@/megickcut/editor/use-editor";
import { useFileUpload } from "@/megickcut/media/use-file-upload";
import { invokeAction } from "@/megickcut/actions";
import { processMediaAssets } from "@/megickcut/media/processing";
import { showMediaUploadToast } from "@/megickcut/media/upload-toast";
import {
  SelectableItem,
  SelectableSurface,
  useSelection,
  useSelectionScope,
} from "@/megickcut/selection";
import { buildElementFromMedia } from "@/megickcut/timeline/element-utils";
import {
  useAssetsPanelStore,
  type PendingMediaImport,
} from "@/megickcut/components/editor/panels/assets/assets-panel-store";
import { MASKABLE_ELEMENT_TYPES } from "@/megickcut/timeline";
import type { MediaAsset } from "@/megickcut/media/types";
import { cn } from "@/megickcut/utils/ui";
import {
  collectImportableSessionMedia,
  getStudioSession,
  importSessionMediaItem,
  listStudioSessions,
  type SessionMediaItem,
} from "@/megickcut/integration/session-media";
import type { ChatSession, ChatSessionDetail } from "@/routes/-dashboard-types";
import {
  CloudUploadIcon,
  Image02Icon,
  MusicNote03Icon,
  Video01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Check, Image as ImageIcon, Import, Loader2, Sparkles, Video } from "lucide-react";
import { displayChatTitle } from "@/lib/chat-title";
import { useI18n } from "@/lib/i18n";

export function MediaView({
  onImportFromSession,
  onOpenAiStudio,
}: {
  onImportFromSession: () => void;
  onOpenAiStudio: () => void;
}) {
  const editor = useEditor();
  const { t } = useI18n();
  const mediaFiles = useEditor((e) => e.media.getAssets());
  const activeProject = useEditor((e) => e.project.getActive());

  const {
    highlightMediaId,
    clearHighlight,
    mediaSortBy,
    mediaSortOrder,
    pendingMediaImports,
    clearPendingMediaImport,
  } = useAssetsPanelStore();

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const processFiles = async ({ files }: { files: File[] }) => {
    if (!files || files.length === 0) return;
    if (!activeProject) {
      toast.error(t("editor.assets.noActiveProject"));
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    try {
      await showMediaUploadToast({
        filesCount: files.length,
        promise: async () => {
          const processedAssets = await processMediaAssets({
            files,
            onProgress: (progress: { progress: number }) => setProgress(progress.progress),
          });
          for (const asset of processedAssets) {
            await editor.media.addMediaAsset({
              projectId: activeProject.metadata.id,
              asset,
            });
          }
          return {
            uploadedCount: processedAssets.length,
            assetNames: processedAssets.map((asset) => asset.name),
          };
        },
      });
    } catch (error) {
      console.error("Error processing files:", error);
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const { isDragOver, dragProps, openFilePicker, fileInputProps } = useFileUpload({
    accept: "image/*,video/*,audio/*",
    multiple: true,
    onFilesSelected: (files) => processFiles({ files }),
  });

  const handleRemove = ({ event, ids }: { event: MouseEvent; ids: string[] }) => {
    event.stopPropagation();

    invokeAction("remove-media-assets", {
      projectId: activeProject.metadata.id,
      assetIds: ids,
    });
  };

  const filteredMediaItems = useMemo(() => {
    const filtered = mediaFiles.filter((item) => !item.ephemeral);

    filtered.sort((a, b) => {
      let valueA: string | number;
      let valueB: string | number;

      switch (mediaSortBy) {
        case "name":
          valueA = a.name.toLowerCase();
          valueB = b.name.toLowerCase();
          break;
        case "type":
          valueA = a.type;
          valueB = b.type;
          break;
        case "duration":
          valueA = a.duration || 0;
          valueB = b.duration || 0;
          break;
        case "size":
          valueA = a.file.size;
          valueB = b.file.size;
          break;
        default:
          return 0;
      }

      if (valueA < valueB) return mediaSortOrder === "asc" ? -1 : 1;
      if (valueA > valueB) return mediaSortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [mediaFiles, mediaSortBy, mediaSortOrder]);
  const orderedMediaIds = useMemo(() => {
    return filteredMediaItems.map((item) => item.id);
  }, [filteredMediaItems]);
  const visiblePendingImports = useMemo(() => {
    const existingSourceKeys = new Set(
      filteredMediaItems
        .map((item) => item.sourceKey)
        .filter((sourceKey): sourceKey is string => Boolean(sourceKey)),
    );
    return Object.values(pendingMediaImports)
      .filter((item) => !existingSourceKeys.has(item.sourceKey))
      .sort((a, b) => a.startedAt - b.startedAt);
  }, [filteredMediaItems, pendingMediaImports]);
  const hasPanelContent = filteredMediaItems.length > 0 || visiblePendingImports.length > 0;

  return (
    <>
      <input {...fileInputProps} />

      <PanelView
        title={t("editor.assets.title")}
        actions={
          <MediaActions
            isProcessing={isProcessing}
            onImport={openFilePicker}
            onImportFromSession={onImportFromSession}
            onOpenAiStudio={onOpenAiStudio}
          />
        }
        className={cn(isDragOver && "bg-accent/30")}
        contentClassName="h-full"
        {...dragProps}
      >
        {isDragOver || !hasPanelContent ? (
          <MediaDragOverlay
            isVisible={true}
            isProcessing={isProcessing}
            progress={progress}
            onClick={openFilePicker}
          />
        ) : (
          <SelectableSurface
            ariaLabel={t("editor.assets.aria")}
            orderedIds={orderedMediaIds}
            revealId={highlightMediaId}
            onRevealComplete={clearHighlight}
          >
            <MediaScopeRegistrar />
            <MediaItemList
              items={filteredMediaItems}
              pendingImports={visiblePendingImports}
              onClearPendingImport={clearPendingMediaImport}
              onRemove={handleRemove}
            />
          </SelectableSurface>
        )}
      </PanelView>
    </>
  );
}

function MediaScopeRegistrar() {
  useSelectionScope();
  return null;
}

function MediaAssetDraggable({
  item,
  preview,
  variant,
  isRounded,
}: {
  item: MediaAsset;
  preview: ReactNode;
  variant: "card" | "compact";
  isRounded?: boolean;
}) {
  const editor = useEditor();

  const addElementAtTime = ({ asset, startTime }: { asset: MediaAsset; startTime: MediaTime }) => {
    const duration =
      asset.duration != null
        ? mediaTimeFromSeconds({ seconds: asset.duration })
        : DEFAULT_NEW_ELEMENT_DURATION;
    const element = buildElementFromMedia({
      mediaId: asset.id,
      mediaType: asset.type,
      name: asset.name,
      duration,
      startTime,
    });
    editor.timeline.insertElement({
      element,
      placement: { mode: "auto" },
    });
  };

  return (
    <DraggableItem
      name={item.name}
      preview={preview}
      dragData={{
        id: item.id,
        type: "media",
        mediaType: item.type,
        name: item.name,
        ...(item.type !== "audio" && {
          targetElementTypes: [...MASKABLE_ELEMENT_TYPES],
        }),
      }}
      shouldShowPlusOnDrag={false}
      onAddToTimeline={({ currentTime }) =>
        addElementAtTime({ asset: item, startTime: currentTime })
      }
      variant={variant}
      isRounded={isRounded}
    />
  );
}

function MediaItemWithContextMenu({
  item,
  children,
  onRemove,
}: {
  item: MediaAsset;
  children: ReactNode;
  onRemove: ({ event, ids }: { event: MouseEvent; ids: string[] }) => void;
}) {
  const { isSelected, selectedIds } = useSelection();
  const idsToDelete = isSelected(item.id) ? selectedIds : [item.id];
  const { t } = useI18n();
  const deleteLabel =
    idsToDelete.length > 1
      ? t("editor.assets.deleteCount", { count: idsToDelete.length })
      : t("editor.assets.delete");

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          variant="destructive"
          onClick={(event: MouseEvent<HTMLDivElement>) => onRemove({ event, ids: idsToDelete })}
        >
          {deleteLabel}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function MediaItemList({
  items,
  pendingImports,
  onClearPendingImport,
  onRemove,
}: {
  items: MediaAsset[];
  pendingImports: PendingMediaImport[];
  onClearPendingImport: (sourceKey: string) => void;
  onRemove: ({ event, ids }: { event: MouseEvent; ids: string[] }) => void;
}) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, 7rem)" }}>
      {pendingImports.map((item) => (
        <PendingMediaImportCard
          item={item}
          key={item.sourceKey}
          onClear={() => onClearPendingImport(item.sourceKey)}
        />
      ))}
      {items.map((item) => (
        <MediaItemWithContextMenu item={item} onRemove={onRemove} key={item.id}>
          <SelectableItem id={item.id}>
            <MediaAssetDraggable
              item={item}
              preview={<MediaPreview item={item} variant="grid" />}
              variant="card"
              isRounded={false}
            />
          </SelectableItem>
        </MediaItemWithContextMenu>
      ))}
    </div>
  );
}

function PendingMediaImportCard({
  item,
  onClear,
}: {
  item: PendingMediaImport;
  onClear: () => void;
}) {
  const { t } = useI18n();
  const isFailed = item.status === "failed";
  const label = isFailed
    ? t("editor.assets.pendingImport.failed")
    : item.kind === "video"
      ? t("editor.assets.pendingImport.importingVideo")
      : item.kind === "image"
        ? t("editor.assets.pendingImport.importingImage")
        : t("editor.assets.pendingImport.importingMedia");
  const detail = item.error ?? item.prompt ?? item.name ?? item.sessionTitle;

  return (
    <div
      aria-live="polite"
      className={cn(
        "group overflow-hidden rounded-md border border-dashed bg-muted/20 text-xs shadow-sm",
        isFailed
          ? "border-destructive/60 bg-destructive/10 text-destructive"
          : "border-primary/40 text-muted-foreground",
      )}
      title={detail}
    >
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-background/70">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_0%,hsl(var(--primary)/0.12)_45%,transparent_70%)]" />
        <HugeiconsIcon
          icon={item.kind === "video" ? Video01Icon : Image02Icon}
          className={cn("size-8 opacity-25", isFailed ? "text-destructive" : "text-primary")}
        />
        {isFailed ? null : (
          <div className="absolute inset-0 flex items-center justify-center bg-background/35 backdrop-blur-[1px]">
            <Loader2 className="size-5 animate-spin text-primary" />
          </div>
        )}
      </div>
      <div className="space-y-1 p-2">
        <div className="truncate font-medium text-foreground">{label}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {detail ?? t("editor.assets.pendingImport.processing")}
        </div>
        {isFailed ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-6 w-full px-2 text-[11px]"
            onClick={onClear}
            aria-label={t("editor.assets.pendingImport.dismiss")}
          >
            {t("common.close")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function formatDuration({ duration }: { duration: number }) {
  const min = Math.floor(duration / 60);
  const sec = Math.floor(duration % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function MediaDurationBadge({ duration }: { duration?: number }) {
  if (!duration) return null;

  return (
    <div className="absolute right-1 bottom-1 rounded bg-black/70 px-1 text-xs text-white">
      {formatDuration({ duration })}
    </div>
  );
}

function MediaDurationLabel({ duration }: { duration?: number }) {
  if (!duration) return null;

  return <span className="text-xs opacity-70">{formatDuration({ duration })}</span>;
}

function MediaTypePlaceholder({
  icon,
  label,
  duration,
  variant,
}: {
  icon: IconSvgElement;
  label: string;
  duration?: number;
  variant: "muted" | "bordered";
}) {
  const iconClassName = cn("size-6", variant === "bordered" && "mb-1");

  return (
    <div
      className={cn(
        "text-muted-foreground flex size-full flex-col items-center justify-center rounded",
        variant === "muted" ? "bg-muted/30" : "border",
      )}
    >
      <HugeiconsIcon icon={icon} className={iconClassName} />
      <span className="text-xs">{label}</span>
      <MediaDurationLabel duration={duration} />
    </div>
  );
}

function MediaPreview({
  item,
  variant = "grid",
}: {
  item: MediaAsset;
  variant?: "grid" | "compact";
}) {
  const shouldShowDurationBadge = variant === "grid";
  const { t } = useI18n();

  if (item.type === "image") {
    return (
      <div className="relative flex size-full items-center justify-center bg-muted">
        <img
          src={item.url ?? ""}
          alt={item.name}
          className="size-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  if (item.type === "video") {
    if (item.thumbnailUrl) {
      return (
        <div className="relative size-full">
          <img
            src={item.thumbnailUrl}
            alt={item.name}
            className="size-full rounded object-cover"
            loading="lazy"
          />
          {shouldShowDurationBadge ? <MediaDurationBadge duration={item.duration} /> : null}
        </div>
      );
    }

    return (
      <MediaTypePlaceholder
        icon={Video01Icon}
        label={t("editor.assets.type.video")}
        duration={item.duration}
        variant="muted"
      />
    );
  }

  if (item.type === "audio") {
    return (
      <MediaTypePlaceholder
        icon={MusicNote03Icon}
        label={t("editor.assets.type.audio")}
        duration={item.duration}
        variant="bordered"
      />
    );
  }

  return (
    <MediaTypePlaceholder
      icon={Image02Icon}
      label={t("editor.assets.type.unknown")}
      variant="muted"
    />
  );
}

function MediaActions({
  isProcessing,
  onImport,
  onImportFromSession,
  onOpenAiStudio,
}: {
  isProcessing: boolean;
  onImport: () => void;
  onImportFromSession: () => void;
  onOpenAiStudio: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex min-w-0 shrink-0 items-center justify-end gap-1 overflow-hidden">
      <Button
        variant="outline"
        onClick={onOpenAiStudio}
        disabled={isProcessing}
        size="sm"
        className="h-7 shrink-0 gap-1 px-1.5 text-xs"
      >
        <Sparkles className="size-3.5" />
        <span className="whitespace-nowrap">{t("editor.assets.aiGenerate")}</span>
      </Button>
      <Button
        variant="outline"
        onClick={onImportFromSession}
        disabled={isProcessing}
        size="sm"
        className="h-7 shrink-0 gap-1 px-1.5 text-xs"
      >
        <Import className="size-3.5" />
        <span className="whitespace-nowrap">{t("editor.assets.sessionImport")}</span>
      </Button>
      <Button
        variant="outline"
        onClick={onImport}
        disabled={isProcessing}
        size="sm"
        className="h-7 shrink-0 gap-1 px-1.5 text-xs"
      >
        <HugeiconsIcon icon={CloudUploadIcon} />
        <span className="whitespace-nowrap">{t("editor.assets.import")}</span>
      </Button>
    </div>
  );
}

export function SessionImportDialog({
  open,
  onOpenChange,
  activeProjectId,
  existingSourceKeys,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeProjectId: string;
  existingSourceKeys: Set<string>;
}) {
  const editor = useEditor();
  const { t, formatDateTime } = useI18n();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<ChatSessionDetail | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingSessions(true);
    setError(null);
    void listStudioSessions()
      .then((items) => {
        if (cancelled) return;
        setSessions(items);
        setSelectedSessionId((current) => current ?? items[0]?.id ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : t("editor.assets.importDialog.loadSessionsFailed"),
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingSessions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !selectedSessionId) {
      setSessionDetail(null);
      setSelectedKeys(new Set());
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    setError(null);
    void getStudioSession({ sessionId: selectedSessionId })
      .then((detail) => {
        if (cancelled) return;
        setSessionDetail(detail);
        setSelectedKeys(new Set());
      })
      .catch((err) => {
        if (cancelled) return;
        setSessionDetail(null);
        setError(
          err instanceof Error ? err.message : t("editor.assets.importDialog.loadSessionFailed"),
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, selectedSessionId]);

  const importableItems = useMemo(
    () =>
      sessionDetail
        ? collectImportableSessionMedia({
            session: sessionDetail,
            kinds: ["image", "video"],
          })
        : [],
    [sessionDetail],
  );
  const selectableItems = importableItems.filter((item) => !existingSourceKeys.has(item.sourceKey));
  const selectedItems = importableItems.filter((item) => selectedKeys.has(item.sourceKey));

  const toggleItem = (item: SessionMediaItem) => {
    if (existingSourceKeys.has(item.sourceKey) || importing) return;
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(item.sourceKey)) {
        next.delete(item.sourceKey);
      } else {
        next.add(item.sourceKey);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (importing) return;
    setSelectedKeys((current) => {
      if (current.size === selectableItems.length) return new Set();
      return new Set(selectableItems.map((item) => item.sourceKey));
    });
  };

  const runImport = async () => {
    if (selectedItems.length === 0) return;
    setImporting(true);
    let importedCount = 0;
    try {
      for (const item of selectedItems) {
        const asset = await importSessionMediaItem({
          editor,
          projectId: activeProjectId,
          item,
          insertOnTimeline: false,
        });
        if (asset) importedCount += 1;
      }
      toast.success(
        t("editor.assets.importDialog.toastSuccess", {
          count: importedCount,
        }),
      );
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to import session media:", err);
      toast.error(t("editor.assets.importDialog.toastError"), {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] max-w-5xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t("editor.assets.importDialog.title")}</DialogTitle>
          <DialogDescription>{t("editor.assets.importDialog.description")}</DialogDescription>
        </DialogHeader>
        <DialogBody className="min-h-0 gap-0 p-0">
          <div className="grid min-h-[26rem] grid-cols-[16rem_minmax(0,1fr)] overflow-hidden">
            <div className="border-r">
              <ScrollArea className="h-[26rem] p-2">
                {loadingSessions ? (
                  <LoadingRow label={t("editor.assets.importDialog.loadingSessions")} />
                ) : sessions.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    {t("editor.assets.importDialog.noSessions")}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {sessions.map((session) => (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => setSelectedSessionId(session.id)}
                        className={cn(
                          "w-full rounded-md px-3 py-2 text-left text-sm transition hover:bg-accent",
                          selectedSessionId === session.id && "bg-accent",
                        )}
                      >
                        <span className="block truncate text-foreground">
                          {displayChatTitle(session.title, t)}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {formatDateTime(session.updatedAt)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
            <div className="min-w-0">
              <div className="flex h-11 items-center justify-between border-b px-3">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={
                      selectableItems.length > 0 && selectedKeys.size === selectableItems.length
                    }
                    disabled={selectableItems.length === 0 || importing}
                    onCheckedChange={toggleAll}
                  />
                  {t("editor.assets.importDialog.selectAll")}
                </label>
                <span className="text-xs text-muted-foreground">
                  {t("editor.assets.importDialog.selectedFound", {
                    selected: selectedItems.length,
                    total: importableItems.length,
                  })}
                </span>
              </div>
              <ScrollArea className="h-[calc(26rem-2.75rem)] p-3">
                {loadingDetail ? (
                  <LoadingRow label={t("editor.assets.importDialog.loadingMedia")} />
                ) : error ? (
                  <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
                    {error}
                  </p>
                ) : importableItems.length === 0 ? (
                  <p className="flex min-h-52 items-center justify-center rounded-md border text-sm text-muted-foreground">
                    {t("editor.assets.importDialog.empty")}
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {importableItems.map((item) => (
                      <SessionMediaCard
                        key={item.sourceKey}
                        item={item}
                        checked={selectedKeys.has(item.sourceKey)}
                        imported={existingSourceKeys.has(item.sourceKey)}
                        disabled={importing}
                        onToggle={() => toggleItem(item)}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            {t("editor.assets.importDialog.cancel")}
          </Button>
          <Button
            onClick={() => void runImport()}
            disabled={importing || selectedItems.length === 0}
          >
            {importing ? <Loader2 className="size-4 animate-spin" /> : <Import />}
            {t("editor.assets.importDialog.importSelected")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LoadingRow({ label }: { label: string }) {
  return (
    <div className="flex h-24 items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      {label}
    </div>
  );
}

function SessionMediaCard({
  item,
  checked,
  imported,
  disabled,
  onToggle,
}: {
  item: SessionMediaItem;
  checked: boolean;
  imported: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const { t, formatDateTime } = useI18n();
  const createdAt =
    typeof item.createdAt === "number" && Number.isFinite(item.createdAt)
      ? formatDateTime(item.createdAt)
      : null;

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled || imported}
      className={cn(
        "group overflow-hidden rounded-md border bg-background text-left transition",
        checked ? "border-primary" : "border-border hover:border-primary/70",
        imported && "opacity-65",
      )}
    >
      <div className="relative aspect-video bg-black">
        {item.kind === "video" ? (
          <video
            src={item.src}
            muted
            playsInline
            preload="metadata"
            className="size-full object-cover"
          />
        ) : (
          <img src={item.src} alt={item.prompt} className="size-full object-cover" loading="lazy" />
        )}
        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] uppercase text-white">
          {item.kind === "video" ? <Video className="size-3" /> : <ImageIcon className="size-3" />}
          {item.kind === "video" ? t("editor.assets.type.video") : t("editor.assets.type.image")}
        </span>
        <span
          className={cn(
            "absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/20 bg-background/90 text-muted-foreground",
            checked && "bg-primary text-primary-foreground",
            imported && "bg-secondary text-secondary-foreground",
          )}
        >
          {checked || imported ? <Check className="size-4" /> : null}
        </span>
      </div>
      <div className="space-y-1 p-2">
        <p className="line-clamp-2 text-xs text-foreground">
          {item.prompt || t("editor.assets.importDialog.untitled")}
        </p>
        <p className="truncate text-[10px] text-muted-foreground">
          {imported
            ? t("editor.assets.importDialog.alreadyImported")
            : (createdAt ?? item.sessionTitle)}
        </p>
      </div>
    </button>
  );
}
