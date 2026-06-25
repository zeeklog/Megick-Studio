import { type ReactNode } from "react";
import { Download, MousePointer2, Move, Redo2, RotateCcw, Upload, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { FloatingConversationPanel } from "./FloatingConversationPanel";
import { ImageCanvasViewport } from "./ImageCanvasViewport";
import { useImageCanvasState } from "./useImageCanvasState";
import type { CanvasAlignment, CanvasTool } from "./types";
import type { StudioResult } from "@/routes/-dashboard-types";

export function ImageStudioWorkspace({
  results,
  selectedId,
  sessionId,
  children,
  onSelectResult,
  renderSelectionToolbar,
}: {
  results: StudioResult[];
  selectedId: string | null;
  sessionId: string | null;
  children: ReactNode;
  onSelectResult: (id: string | null) => void;
  renderSelectionToolbar?: (result: StudioResult) => ReactNode;
}) {
  const { t } = useI18n();
  const canvas = useImageCanvasState({
    results,
    storageKey: sessionId ? `megick.studio.imageCanvas.${sessionId}` : undefined,
  });
  const selectedResult = canvas.selectedItems.length === 1 ? canvas.selectedItems[0]?.result : null;

  const setTool = (tool: CanvasTool) => canvas.setTool(tool);

  return (
    <div className="relative h-full min-h-[560px] overflow-hidden rounded-[2rem] border border-border/60 bg-[#08080d] text-white shadow-[0_24px_120px_rgba(0,0,0,0.25)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_34%),radial-gradient(circle_at_80%_20%,rgba(34,211,238,0.18),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.04),transparent_38%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:48px_48px]" />

      <ImageCanvasViewport
        items={canvas.items}
        selectedIds={canvas.selectedIds}
        selectedItems={canvas.selectedItems}
        tool={canvas.tool}
        onSelectOnly={(id) => {
          canvas.selectOnly(id);
          onSelectResult(id);
        }}
        onToggleSelected={canvas.toggleSelected}
        onSelectMany={canvas.selectMany}
        onSelectIntersecting={canvas.selectIntersecting}
        onUpdateItemRects={canvas.updateItemRects}
        onAlign={canvas.alignSelected}
      />

      <FloatingConversationPanel>{children}</FloatingConversationPanel>

      {selectedResult ? (
        <div className="absolute right-4 top-1/2 z-30 -translate-y-1/2">
          {renderSelectionToolbar?.(selectedResult)}
        </div>
      ) : null}

      <div className="absolute right-4 top-4 z-30">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="border border-white/20 bg-white/[0.16] text-white shadow-lg backdrop-blur-2xl hover:bg-white/[0.26] hover:text-white">
              <Download className="mr-1.5 h-4 w-4" />
              {t("studio.canvas.export")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={!canvas.selectedItems.length}>
              {t("studio.canvas.exportSeparate")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canvas.selectedItems.length}>
              {t("studio.canvas.exportMerged")}
            </DropdownMenuItem>
            <DropdownMenuItem disabled>{t("studio.canvas.export2k")}</DropdownMenuItem>
            <DropdownMenuItem disabled>{t("studio.canvas.export4k")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/18 bg-black/35 p-1.5 shadow-[0_18px_70px_rgba(0,0,0,0.28)] backdrop-blur-2xl">
        <ToolbarButton active={canvas.tool === "select"} onClick={() => setTool("select")} title={t("studio.canvas.select")}>
          <MousePointer2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton active={canvas.tool === "pan"} onClick={() => setTool("pan")} title={t("studio.canvas.pan")}>
          <Move className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => undefined} title={t("studio.canvas.upload")}>
          <Upload className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton disabled={!canvas.canUndo} onClick={canvas.undo} title={t("studio.canvas.undo")}>
          <Undo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton disabled={!canvas.canRedo} onClick={canvas.redo} title={t("studio.canvas.redo")}>
          <Redo2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          disabled={!canvas.selectedItems.length}
          onClick={() => canvas.hideItems([...canvas.selectedIds])}
          title={t("studio.canvas.hide")}
        >
          <RotateCcw className="h-4 w-4" />
        </ToolbarButton>
      </div>
    </div>
  );
}

function ToolbarButton({
  children,
  active,
  disabled,
  title,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      disabled={disabled}
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "h-9 w-9 text-white/75 hover:bg-white/15 hover:text-white disabled:opacity-35",
        active && "bg-white/18 text-white shadow-inner",
      )}
    >
      {children}
    </Button>
  );
}

export const CANVAS_ALIGNMENT_LABELS: Record<CanvasAlignment, string> = {
  left: "studio.canvas.alignLeft",
  right: "studio.canvas.alignRight",
  horizontalCenter: "studio.canvas.alignHorizontalCenter",
  top: "studio.canvas.alignTop",
  bottom: "studio.canvas.alignBottom",
  verticalCenter: "studio.canvas.alignVerticalCenter",
  verticalStack: "studio.canvas.alignVerticalStack",
};
