import { useMemo, useRef, useState } from "react";
import { AlignCenter, AlignEndHorizontal, AlignEndVertical, AlignHorizontalJustifyCenter, AlignStartHorizontal, AlignStartVertical, AlignVerticalJustifyCenter, Grip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { CanvasAlignment, CanvasItem, CanvasRect, CanvasResizeHandle, CanvasTool } from "./types";
import { boundingRect } from "./useImageCanvasState";

type DragState =
  | {
      kind: "move";
      pointerId: number;
      start: { x: number; y: number };
      originals: Record<string, CanvasRect>;
    }
  | {
      kind: "resize";
      pointerId: number;
      itemId: string;
      handle: CanvasResizeHandle;
      start: { x: number; y: number };
      original: CanvasRect;
    }
  | null;

export function ImageCanvasViewport({
  items,
  selectedIds,
  selectedItems,
  tool,
  onSelectOnly,
  onToggleSelected,
  onSelectMany,
  onSelectIntersecting,
  onUpdateItemRects,
  onAlign,
}: {
  items: CanvasItem[];
  selectedIds: Set<string>;
  selectedItems: CanvasItem[];
  tool: CanvasTool;
  onSelectOnly: (id: string | null) => void;
  onToggleSelected: (id: string) => void;
  onSelectMany: (ids: string[]) => void;
  onSelectIntersecting: (rect: CanvasRect) => void;
  onUpdateItemRects: (patches: Record<string, CanvasRect>) => void;
  onAlign: (alignment: CanvasAlignment) => void;
}) {
  const { t } = useI18n();
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>(null);
  const [draftRects, setDraftRects] = useState<Record<string, CanvasRect>>({});
  const [marquee, setMarquee] = useState<CanvasRect | null>(null);
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null);

  const selectedBox = useMemo(
    () => (selectedItems.length > 1 ? boundingRect(selectedItems) : null),
    [selectedItems],
  );

  const pointFromEvent = (event: React.PointerEvent) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  };

  const startMarquee = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || tool !== "select") return;
    const point = pointFromEvent(event);
    setMarqueeStart(point);
    setMarquee({ x: point.x, y: point.y, width: 0, height: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onViewportPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!marqueeStart) return;
    const point = pointFromEvent(event);
    setMarquee({
      x: Math.min(marqueeStart.x, point.x),
      y: Math.min(marqueeStart.y, point.y),
      width: Math.abs(point.x - marqueeStart.x),
      height: Math.abs(point.y - marqueeStart.y),
    });
  };

  const finishMarquee = () => {
    if (marquee && marquee.width > 8 && marquee.height > 8) onSelectIntersecting(marquee);
    else onSelectOnly(null);
    setMarqueeStart(null);
    setMarquee(null);
  };

  const startMove = (event: React.PointerEvent, item: CanvasItem) => {
    event.stopPropagation();
    if (tool !== "select") return;
    if (event.metaKey || event.ctrlKey) onToggleSelected(item.id);
    else if (!selectedIds.has(item.id)) onSelectOnly(item.id);
    const activeIds = selectedIds.has(item.id) ? [...selectedIds] : [item.id];
    const originals = Object.fromEntries(
      items.filter((candidate) => activeIds.includes(candidate.id)).map((candidate) => [candidate.id, candidate]),
    );
    dragRef.current = {
      kind: "move",
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      originals,
    };
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  };

  const startResize = (event: React.PointerEvent, item: CanvasItem, handle: CanvasResizeHandle) => {
    event.stopPropagation();
    onSelectOnly(item.id);
    dragRef.current = {
      kind: "resize",
      pointerId: event.pointerId,
      itemId: item.id,
      handle,
      start: { x: event.clientX, y: event.clientY },
      original: item,
    };
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  };

  const onItemPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.start.x;
    const dy = event.clientY - drag.start.y;
    if (drag.kind === "move") {
      setDraftRects(
        Object.fromEntries(
          Object.entries(drag.originals).map(([id, rect]) => [id, { ...rect, x: rect.x + dx, y: rect.y + dy }]),
        ),
      );
      return;
    }
    const next = resizeRect(drag.original, drag.handle, dx, dy);
    setDraftRects({ [drag.itemId]: next });
  };

  const finishDrag = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    onUpdateItemRects(draftRects);
    setDraftRects({});
    dragRef.current = null;
  };

  return (
    <div
      ref={viewportRef}
      className={cn("absolute inset-0 z-10 overflow-hidden", tool === "pan" ? "cursor-grab" : "cursor-crosshair")}
      onPointerDown={startMarquee}
      onPointerMove={onViewportPointerMove}
      onPointerUp={finishMarquee}
      onPointerCancel={finishMarquee}
    >
      {items.length === 0 ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 max-w-sm -translate-x-1/2 -translate-y-1/2 text-center text-sm text-white/50">
          {t("studio.canvas.empty")}
        </div>
      ) : null}
      {items.map((item) => {
        const rect = draftRects[item.id] ?? item;
        const selected = selectedIds.has(item.id);
        return (
          <div
            key={item.id}
            className={cn(
              "absolute select-none overflow-visible rounded-xl",
              tool === "select" ? "cursor-move" : "cursor-grab",
            )}
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
            onPointerDown={(event) => startMove(event, item)}
            onPointerMove={onItemPointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
          >
            <div
              className={cn(
                "relative h-full w-full overflow-hidden rounded-xl border bg-black shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition",
                selected ? "border-primary ring-2 ring-primary/45" : "border-white/12 hover:border-white/35",
              )}
            >
              {item.status === "loading" ? (
                <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(120deg,rgba(168,85,247,0.22),rgba(34,211,238,0.16),rgba(244,114,182,0.18))] bg-[length:200%_200%] animate-gradient-shift">
                  <div className="rounded-full border border-white/20 bg-black/25 px-3 py-1 text-xs text-white/75 backdrop-blur">
                    {t("studio.canvas.generating")}
                  </div>
                </div>
              ) : (
                <img
                  src={item.src}
                  alt={item.prompt}
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            {selected && selectedIds.size === 1
              ? RESIZE_HANDLES.map((handle) => (
                  <button
                    key={handle}
                    type="button"
                    aria-label={handle}
                    className={cn(
                      "absolute z-10 h-3 w-3 rounded-full border border-white bg-primary shadow-lg",
                      handleClass(handle),
                    )}
                    onPointerDown={(event) => startResize(event, item, handle)}
                    onPointerMove={onItemPointerMove}
                    onPointerUp={finishDrag}
                    onPointerCancel={finishDrag}
                  />
                ))
              : null}
          </div>
        );
      })}
      {selectedBox ? (
        <div
          className="absolute z-20 flex -translate-y-full items-center gap-1 rounded-xl border border-white/18 bg-black/40 p-1 text-white shadow-xl backdrop-blur-2xl"
          style={{ left: selectedBox.x, top: Math.max(12, selectedBox.y - 10) }}
        >
          <AlignmentButton title={t("studio.canvas.alignLeft")} onClick={() => onAlign("left")}><AlignStartVertical className="h-3.5 w-3.5" /></AlignmentButton>
          <AlignmentButton title={t("studio.canvas.alignRight")} onClick={() => onAlign("right")}><AlignEndVertical className="h-3.5 w-3.5" /></AlignmentButton>
          <AlignmentButton title={t("studio.canvas.alignHorizontalCenter")} onClick={() => onAlign("horizontalCenter")}><AlignVerticalJustifyCenter className="h-3.5 w-3.5" /></AlignmentButton>
          <AlignmentButton title={t("studio.canvas.alignTop")} onClick={() => onAlign("top")}><AlignStartHorizontal className="h-3.5 w-3.5" /></AlignmentButton>
          <AlignmentButton title={t("studio.canvas.alignBottom")} onClick={() => onAlign("bottom")}><AlignEndHorizontal className="h-3.5 w-3.5" /></AlignmentButton>
          <AlignmentButton title={t("studio.canvas.alignVerticalCenter")} onClick={() => onAlign("verticalCenter")}><AlignHorizontalJustifyCenter className="h-3.5 w-3.5" /></AlignmentButton>
          <AlignmentButton title={t("studio.canvas.alignVerticalStack")} onClick={() => onAlign("verticalStack")}><Grip className="h-3.5 w-3.5" /></AlignmentButton>
        </div>
      ) : null}
      {marquee ? (
        <div
          className="absolute z-40 border border-primary/80 bg-primary/15"
          style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }}
        />
      ) : null}
    </div>
  );
}

const RESIZE_HANDLES: CanvasResizeHandle[] = ["n", "s", "e", "w", "nw", "ne", "sw", "se"];

function handleClass(handle: CanvasResizeHandle) {
  const classes: Record<CanvasResizeHandle, string> = {
    n: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize",
    s: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize",
    e: "right-0 top-1/2 -translate-y-1/2 translate-x-1/2 cursor-ew-resize",
    w: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
    nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
    ne: "right-0 top-0 -translate-y-1/2 translate-x-1/2 cursor-nesw-resize",
    sw: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
    se: "bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
  };
  return classes[handle];
}

function resizeRect(rect: CanvasRect, handle: CanvasResizeHandle, dx: number, dy: number): CanvasRect {
  const min = 72;
  const next = { ...rect };
  if (handle.includes("e")) next.width = Math.max(min, rect.width + dx);
  if (handle.includes("s")) next.height = Math.max(min, rect.height + dy);
  if (handle.includes("w")) {
    next.width = Math.max(min, rect.width - dx);
    next.x = rect.x + (rect.width - next.width);
  }
  if (handle.includes("n")) {
    next.height = Math.max(min, rect.height - dy);
    next.y = rect.y + (rect.height - next.height);
  }
  return next;
}

function AlignmentButton({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <Button type="button" size="icon" variant="ghost" title={title} aria-label={title} onClick={onClick} className="h-7 w-7 text-white/75 hover:bg-white/15 hover:text-white">
      {children}
    </Button>
  );
}
