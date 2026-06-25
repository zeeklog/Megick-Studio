import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useI18n } from "@/lib/i18n";

type SourceImageSize = { width: number; height: number };

function sourceSizeFromImage(image: HTMLImageElement): SourceImageSize {
  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
}

function exportMask(canvas: HTMLCanvasElement, sourceSize: SourceImageSize | null) {
  if (!sourceSize || (canvas.width === sourceSize.width && canvas.height === sourceSize.height)) {
    return canvas.toDataURL("image/png");
  }

  const output = document.createElement("canvas");
  output.width = sourceSize.width;
  output.height = sourceSize.height;
  const ctx = output.getContext("2d");
  if (!ctx) return canvas.toDataURL("image/png");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, output.width, output.height);
  ctx.drawImage(canvas, 0, 0, output.width, output.height);
  return output.toDataURL("image/png");
}

export function ImageMaskEditor({
  src,
  onMaskChange,
  variant = "default",
}: {
  src: string;
  onMaskChange: (dataUrl: string | null) => void;
  variant?: "default" | "dark";
}) {
  const { t } = useI18n();
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const sourceSizeRef = useRef<SourceImageSize | null>(null);
  const drawingRef = useRef(false);
  const [brushSize, setBrushSize] = useState(36);

  useEffect(() => {
    let canceled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (canceled) return;
      const imageCanvas = imageCanvasRef.current;
      const maskCanvas = maskCanvasRef.current;
      if (!imageCanvas || !maskCanvas) return;
      const { width, height } = sourceSizeFromImage(image);
      if (!width || !height) return;
      sourceSizeRef.current = { width, height };
      for (const canvas of [imageCanvas, maskCanvas]) {
        canvas.width = width;
        canvas.height = height;
        canvas.style.aspectRatio = `${width} / ${height}`;
      }
      const imageCtx = imageCanvas.getContext("2d");
      const maskCtx = maskCanvas.getContext("2d");
      if (!imageCtx || !maskCtx) return;
      imageCtx.clearRect(0, 0, width, height);
      imageCtx.drawImage(image, 0, 0, width, height);
      maskCtx.fillStyle = "#000000";
      maskCtx.fillRect(0, 0, width, height);
      onMaskChange(null);
    };
    image.src = src;
    return () => {
      canceled = true;
    };
  }, [onMaskChange, src]);

  const drawAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = maskCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    onMaskChange(exportMask(canvas, sourceSizeRef.current));
  };

  const clearMask = () => {
    const canvas = maskCanvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onMaskChange(null);
  };

  return (
    <div className="grid gap-3">
      <div
        className={
          variant === "dark"
            ? "relative overflow-hidden rounded-[1.15rem] bg-black"
            : "relative overflow-hidden rounded-xl border border-border bg-black"
        }
      >
        <canvas
          ref={imageCanvasRef}
          className="block max-h-[68vh] w-full object-contain lg:max-h-[72vh]"
        />
        <canvas
          ref={maskCanvasRef}
          className="absolute inset-0 h-full w-full cursor-crosshair opacity-45 mix-blend-screen"
          onPointerDown={(event) => {
            drawingRef.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            drawAt(event);
          }}
          onPointerMove={drawAt}
          onPointerUp={(event) => {
            drawingRef.current = false;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            drawingRef.current = false;
          }}
        />
      </div>
      <div
        className={
          variant === "dark"
            ? "flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-white"
            : "flex items-center gap-3"
        }
      >
        <span
          className={variant === "dark" ? "text-xs text-white/55" : "text-xs text-muted-foreground"}
        >
          {t("studio.tool.brush")}
        </span>
        <Slider
          value={[brushSize]}
          min={8}
          max={96}
          step={2}
          onValueChange={(value) => setBrushSize(value[0] ?? 36)}
          className="flex-1"
        />
        <span
          className={
            variant === "dark"
              ? "w-10 text-right text-xs tabular-nums text-white/55"
              : "w-10 text-right text-xs tabular-nums text-muted-foreground"
          }
        >
          {brushSize}px
        </span>
        <Button
          type="button"
          size="sm"
          variant={variant === "dark" ? "secondary" : "outline"}
          onClick={clearMask}
        >
          {t("studio.clearMarks")}
        </Button>
      </div>
    </div>
  );
}
