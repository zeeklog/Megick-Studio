import { useEffect, useRef, useState, type ReactNode } from "react";
import { GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const PANEL_WIDTH = 420;
const PANEL_MARGIN = 16;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function FloatingConversationPanel({ children }: { children: ReactNode }) {
  const [position, setPosition] = useState({ x: PANEL_MARGIN, y: PANEL_MARGIN });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    const onResize = () => {
      setPosition((current) => ({
        x: clamp(current.x, PANEL_MARGIN, Math.max(PANEL_MARGIN, window.innerWidth - PANEL_WIDTH - PANEL_MARGIN)),
        y: clamp(current.y, PANEL_MARGIN, Math.max(PANEL_MARGIN, window.innerHeight - 160)),
      }));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (window.matchMedia("(max-width: 767px)").matches) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const nextX = drag.originX + event.clientX - drag.startX;
    const nextY = drag.originY + event.clientY - drag.startY;
    setPosition({
      x: clamp(nextX, PANEL_MARGIN, Math.max(PANEL_MARGIN, window.innerWidth - PANEL_WIDTH - PANEL_MARGIN)),
      y: clamp(nextY, PANEL_MARGIN, Math.max(PANEL_MARGIN, window.innerHeight - 160)),
    });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  return (
    <div
      className={cn(
        "absolute z-30 flex min-h-0 w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/92 shadow-[0_24px_80px_rgba(0,0,0,0.24)] backdrop-blur-2xl",
        "max-md:inset-x-3 max-md:bottom-3 max-md:top-auto max-md:h-[68dvh] max-md:w-auto",
      )}
      style={{ left: position.x, top: position.y, height: "calc(100% - 2rem)" }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="group flex h-5 shrink-0 cursor-grab touch-none items-center justify-center border-b border-border/40 bg-background/35 text-muted-foreground active:cursor-grabbing max-md:hidden"
      >
        <GripHorizontal className="h-3.5 w-3.5 opacity-40 transition group-hover:opacity-100" />
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
