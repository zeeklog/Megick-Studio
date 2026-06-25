import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Brush,
  Eraser,
  Type as TypeIcon,
  Crop,
  Undo2,
  Redo2,
  Download,
  Save,
  X,
  Sparkles,
  Trash2,
  ImageDown,
  PaintBucket,
  Move,
  Loader2,
  Maximize2,
  RotateCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { filterLabelKey, useI18n } from "@/lib/i18n";

type Point = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };

type ActionBase = {
  id: string;
  rotation: number;
};

type StrokeAction = ActionBase & {
  kind: "stroke";
  points: Point[];
  color: string;
  width: number;
  erase?: boolean;
};

type TextAction = ActionBase & {
  kind: "text";
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
  width: number;
  height: number;
};

type Action = StrokeAction | TextAction;

type Snapshot = {
  baseSrc: string;
  filterSourceSrc: string;
  activeFilter: string;
  actions: Action[];
};

type Tool = "brush" | "eraser" | "text" | "crop" | "move";

type ActionDrag = {
  mode: "move" | "resize" | "rotate";
  id: string;
  start: Point;
  original: Action;
  center: Point;
  startAngle: number;
  startDistance: number;
  snapshotTaken: boolean;
};

type CropDrag = {
  mode: "move" | "resize";
  start: Point;
  original: Rect;
  corner?: "nw" | "ne" | "sw" | "se";
};

const FILTER_PRESETS: Array<{ id: string; label: string; css: string }> = [
  { id: "none", label: "Original", css: "none" },
  { id: "vivid", label: "Vivid", css: "saturate(1.4) contrast(1.1)" },
  { id: "warm", label: "Warm", css: "sepia(0.2) saturate(1.2) hue-rotate(-10deg)" },
  { id: "cool", label: "Cool", css: "saturate(1.1) hue-rotate(15deg) brightness(1.05)" },
  { id: "mono", label: "Mono", css: "grayscale(1) contrast(1.1)" },
  { id: "noir", label: "Noir", css: "grayscale(1) contrast(1.4) brightness(0.9)" },
  { id: "vintage", label: "Vintage", css: "sepia(0.5) saturate(1.2) contrast(0.95)" },
  { id: "fade", label: "Fade", css: "contrast(0.9) saturate(0.7) brightness(1.05)" },
  { id: "blur", label: "Soft focus", css: "blur(1.5px)" },
];

const COLOR_SWATCHES = [
  "#ffffff",
  "#000000",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
];

const MIN_CROP_SIZE = 16;
const MIN_ACTION_SCALE = 0.2;
const MAX_ACTION_SCALE = 8;
const EDIT_UPLOAD_TARGET_BYTES = 10 * 1024 * 1024;
const EDIT_EXPORT_MAX_EDGES = [4096, 3072, 2048, 1536];
const EDIT_EXPORT_QUALITIES = [0.9, 0.82, 0.74];

function createActionId() {
  return `canvas-action-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampPointToImage(point: Point, imageSize: { w: number; h: number }): Point {
  return {
    x: clamp(point.x, 0, imageSize.w),
    y: clamp(point.y, 0, imageSize.h),
  };
}

function normaliseRect(rect: Rect): Rect {
  const x = rect.w < 0 ? rect.x + rect.w : rect.x;
  const y = rect.h < 0 ? rect.y + rect.h : rect.y;
  return { x, y, w: Math.abs(rect.w), h: Math.abs(rect.h) };
}

function clampRectToImage(rect: Rect, imageSize: { w: number; h: number }): Rect {
  const normalized = normaliseRect(rect);
  const left = clamp(normalized.x, 0, imageSize.w);
  const top = clamp(normalized.y, 0, imageSize.h);
  const right = clamp(normalized.x + normalized.w, 0, imageSize.w);
  const bottom = clamp(normalized.y + normalized.h, 0, imageSize.h);
  return {
    x: Math.min(left, right),
    y: Math.min(top, bottom),
    w: Math.abs(right - left),
    h: Math.abs(bottom - top),
  };
}

function estimateTextSize(text: string, fontSize: number): Pick<Rect, "w" | "h"> {
  const chars = Array.from(text);
  const width = chars.reduce((sum, char) => {
    if (/\s/.test(char)) return sum + fontSize * 0.32;
    return sum + fontSize * (/[\u4e00-\u9fff]/.test(char) ? 1 : 0.62);
  }, 0);
  return {
    w: Math.max(width, fontSize),
    h: fontSize * 1.18,
  };
}

function measureTextSize(
  text: string,
  fontSize: number,
  ctx?: CanvasRenderingContext2D | null,
): Pick<Rect, "w" | "h"> {
  if (!ctx) return estimateTextSize(text, fontSize);
  ctx.save();
  ctx.font = `bold ${fontSize}px Inter, sans-serif`;
  const metrics = ctx.measureText(text);
  ctx.restore();
  return {
    w: Math.max(metrics.width, fontSize),
    h: fontSize * 1.18,
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

function exportCanvasForEdge(source: HTMLCanvasElement, maxEdge: number, opaque: boolean) {
  const width = source.width || 1;
  const height = source.height || 1;
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  if (scale === 1 && !opaque) return source;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;
  if (opaque) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function exportEditedCanvasBlob(source: HTMLCanvasElement) {
  let smallest: Blob | null = null;

  for (const edge of EDIT_EXPORT_MAX_EDGES) {
    for (const quality of EDIT_EXPORT_QUALITIES) {
      const webpCanvas = exportCanvasForEdge(source, edge, false);
      const webp = await canvasToBlob(webpCanvas, "image/webp", quality);
      if (webp) {
        if (!smallest || webp.size < smallest.size) smallest = webp;
        if (webp.size <= EDIT_UPLOAD_TARGET_BYTES) return webp;
      }

      const jpegCanvas = exportCanvasForEdge(source, edge, true);
      const jpeg = await canvasToBlob(jpegCanvas, "image/jpeg", quality);
      if (jpeg) {
        if (!smallest || jpeg.size < smallest.size) smallest = jpeg;
        if (jpeg.size <= EDIT_UPLOAD_TARGET_BYTES) return jpeg;
      }
    }
  }

  return smallest ?? canvasToBlob(source, "image/png");
}

function getTextSize(action: TextAction): Pick<Rect, "w" | "h"> {
  return {
    w: action.width || estimateTextSize(action.text, action.fontSize).w,
    h: action.height || estimateTextSize(action.text, action.fontSize).h,
  };
}

function getActionBounds(action: Action): Rect {
  if (action.kind === "text") {
    const size = getTextSize(action);
    return { x: action.x, y: action.y, w: size.w, h: size.h };
  }

  if (!action.points.length) return { x: 0, y: 0, w: 1, h: 1 };
  const xs = action.points.map((point) => point.x);
  const ys = action.points.map((point) => point.y);
  const pad = Math.max(action.width / 2, 6);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;
  return { x: minX, y: minY, w: Math.max(maxX - minX, 1), h: Math.max(maxY - minY, 1) };
}

function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

function rotatePoint(point: Point, center: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

function pointInRect(point: Point, rect: Rect, pad = 0) {
  return (
    point.x >= rect.x - pad &&
    point.x <= rect.x + rect.w + pad &&
    point.y >= rect.y - pad &&
    point.y <= rect.y + rect.h + pad
  );
}

function distanceToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  const projection = { x: start.x + t * dx, y: start.y + t * dy };
  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function hitTestAction(action: Action, point: Point) {
  const bounds = getActionBounds(action);
  const center = rectCenter(bounds);
  const localPoint = rotatePoint(point, center, -action.rotation);

  if (action.kind === "text") {
    return pointInRect(localPoint, bounds, 6);
  }

  if (!pointInRect(localPoint, bounds, action.width + 8)) return false;
  if (action.points.length === 1) {
    return (
      Math.hypot(localPoint.x - action.points[0].x, localPoint.y - action.points[0].y) <=
      action.width + 8
    );
  }
  return action.points.some((segmentStart, index) => {
    const segmentEnd = action.points[index + 1];
    if (!segmentEnd) return false;
    return distanceToSegment(localPoint, segmentStart, segmentEnd) <= action.width / 2 + 8;
  });
}

function translateAction(action: Action, dx: number, dy: number): Action {
  if (action.kind === "text") {
    return { ...action, x: action.x + dx, y: action.y + dy };
  }
  return {
    ...action,
    points: action.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
  };
}

function resizeAction(action: Action, scale: number, center: Point): Action {
  if (action.kind === "text") {
    const nextWidth = Math.max(action.width * scale, 8);
    const nextHeight = Math.max(action.height * scale, 8);
    return {
      ...action,
      x: center.x - nextWidth / 2,
      y: center.y - nextHeight / 2,
      width: nextWidth,
      height: nextHeight,
      fontSize: clamp(action.fontSize * scale, 8, 240),
    };
  }

  return {
    ...action,
    width: clamp(action.width * scale, 1, 160),
    points: action.points.map((point) => ({
      x: center.x + (point.x - center.x) * scale,
      y: center.y + (point.y - center.y) * scale,
    })),
  };
}

function updateActionRotation(action: Action, rotation: number): Action {
  return { ...action, rotation };
}

function moveCropRect(rect: Rect, dx: number, dy: number, imageSize: { w: number; h: number }) {
  return {
    ...rect,
    x: clamp(rect.x + dx, 0, Math.max(0, imageSize.w - rect.w)),
    y: clamp(rect.y + dy, 0, Math.max(0, imageSize.h - rect.h)),
  };
}

function resizeCropRect(
  rect: Rect,
  corner: NonNullable<CropDrag["corner"]>,
  point: Point,
  imageSize: { w: number; h: number },
) {
  const p = clampPointToImage(point, imageSize);
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.w;
  let bottom = rect.y + rect.h;

  if (corner.includes("w")) left = Math.min(p.x, right - MIN_CROP_SIZE);
  if (corner.includes("e")) right = Math.max(p.x, left + MIN_CROP_SIZE);
  if (corner.includes("n")) top = Math.min(p.y, bottom - MIN_CROP_SIZE);
  if (corner.includes("s")) bottom = Math.max(p.y, top + MIN_CROP_SIZE);

  left = clamp(left, 0, imageSize.w);
  top = clamp(top, 0, imageSize.h);
  right = clamp(right, 0, imageSize.w);
  bottom = clamp(bottom, 0, imageSize.h);

  return {
    x: Math.min(left, right),
    y: Math.min(top, bottom),
    w: Math.max(Math.abs(right - left), 1),
    h: Math.max(Math.abs(bottom - top), 1),
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

async function loadImageWithFallback(src: string, fallbackSrc?: string) {
  const sources = [
    ...new Set([src, fallbackSrc].filter((value): value is string => Boolean(value))),
  ];
  let lastError: unknown;
  for (const source of sources) {
    try {
      return { img: await loadImage(source), src: source };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export type StudioCanvasProps = {
  src: string;
  fallbackSrc?: string;
  onSave?: (blob: Blob) => void | Promise<void>;
  onClose?: () => void;
  saving?: boolean;
};

export function StudioCanvas({
  src,
  fallbackSrc,
  onSave,
  onClose,
  saving = false,
}: StudioCanvasProps) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [baseSrc, setBaseSrc] = useState(src);
  const [filterSourceSrc, setFilterSourceSrc] = useState(src);
  const [activeFilter, setActiveFilter] = useState("none");
  const [actions, setActions] = useState<Action[]>([]);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [redoStack, setRedoStack] = useState<Snapshot[]>([]);

  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState("#ec4899");
  const [strokeWidth, setStrokeWidth] = useState(6);
  const [fontSize, setFontSize] = useState(36);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);

  const [imageSize, setImageSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);
  const [imageLoading, setImageLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [draftStroke, setDraftStroke] = useState<StrokeAction | null>(null);
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  );
  const cropStartRef = useRef<Point | null>(null);
  const actionDragRef = useRef<ActionDrag | null>(null);
  const cropDragRef = useRef<CropDrag | null>(null);

  const pushSnapshot = useCallback(() => {
    setHistory((h) => [...h, { baseSrc, filterSourceSrc, activeFilter, actions }]);
    setRedoStack([]);
  }, [baseSrc, filterSourceSrc, activeFilter, actions]);

  useEffect(() => {
    setBaseSrc(src);
    setFilterSourceSrc(src);
    setActiveFilter("none");
    setActions([]);
    setHistory([]);
    setRedoStack([]);
    setCropRect(null);
    setSelectedActionId(null);
    setImageSize({ w: 0, h: 0 });
    setImageLoading(true);
  }, [src]);

  // Load base image, set canvas size
  useEffect(() => {
    let cancelled = false;
    setImageLoading(true);
    (async () => {
      try {
        const loaded = await loadImageWithFallback(
          baseSrc,
          baseSrc === src ? fallbackSrc : undefined,
        );
        if (cancelled) return;
        const { img } = loaded;
        if (loaded.src !== baseSrc) setBaseSrc(loaded.src);
        if (baseSrc === filterSourceSrc && loaded.src !== filterSourceSrc) {
          setFilterSourceSrc(loaded.src);
        }
        setImageSize({ w: img.naturalWidth, h: img.naturalHeight });
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
        }
      } catch {
        if (!cancelled) toast.error(t("studio.imageLoadFailed"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [baseSrc, fallbackSrc, filterSourceSrc, src, t]);

  // Compute scale based on container size to fit image
  useEffect(() => {
    if (!imageSize.w || !imageSize.h) return;
    const compute = () => {
      const c = containerRef.current;
      if (!c) return;
      const cw = c.clientWidth;
      const ch = c.clientHeight;
      const s = Math.min(cw / imageSize.w, ch / imageSize.h, 1);
      setScale(s || 1);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, [imageSize]);

  // Render canvas: base image + actions + draft stroke
  const render = useCallback(
    async (options: { includeCropOverlay?: boolean } = {}) => {
      const canvas = canvasRef.current;
      if (!canvas || !imageSize.w) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      try {
        const img = await loadImage(baseSrc);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.filter = "none";
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const renderStroke = (s: StrokeAction) => {
          if (s.points.length < 1) return;
          const bounds = getActionBounds(s);
          const center = rectCenter(bounds);
          ctx.save();
          ctx.translate(center.x, center.y);
          ctx.rotate(s.rotation);
          ctx.translate(-center.x, -center.y);
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.strokeStyle = s.color;
          ctx.lineWidth = s.width;
          ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
          ctx.beginPath();
          ctx.moveTo(s.points[0].x, s.points[0].y);
          for (let i = 1; i < s.points.length; i++) {
            ctx.lineTo(s.points[i].x, s.points[i].y);
          }
          ctx.stroke();
          ctx.restore();
        };
        const renderText = (textAction: TextAction) => {
          const size = measureTextSize(textAction.text, textAction.fontSize, ctx);
          const bounds = {
            x: textAction.x,
            y: textAction.y,
            w: textAction.width || size.w,
            h: textAction.height || size.h,
          };
          const center = rectCenter(bounds);
          ctx.save();
          ctx.translate(center.x, center.y);
          ctx.rotate(textAction.rotation);
          ctx.fillStyle = textAction.color;
          ctx.font = `bold ${textAction.fontSize}px Inter, sans-serif`;
          ctx.textBaseline = "top";
          ctx.shadowColor = "rgba(0,0,0,0.5)";
          ctx.shadowBlur = 6;
          ctx.fillText(textAction.text, -bounds.w / 2, -bounds.h / 2);
          ctx.restore();
        };
        for (const a of actions) {
          if (a.kind === "stroke") renderStroke(a);
          if (a.kind === "text") renderText(a);
        }
        if (draftStroke) renderStroke(draftStroke);
        if (cropRect && options.includeCropOverlay !== false) {
          ctx.save();
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.beginPath();
          ctx.rect(0, 0, canvas.width, canvas.height);
          ctx.rect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
          ctx.fill("evenodd");
          ctx.strokeStyle = "#f2b233";
          ctx.setLineDash([10, 8]);
          ctx.lineWidth = 2;
          ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
          ctx.restore();
        }
        setImageLoading(false);
      } catch {
        /* noop */
      }
    },
    [baseSrc, actions, draftStroke, imageSize.w, cropRect],
  );

  useEffect(() => {
    render();
  }, [render]);

  const selectedAction = useMemo(
    () => actions.find((action) => action.id === selectedActionId) ?? null,
    [actions, selectedActionId],
  );
  const selectedBounds = selectedAction ? getActionBounds(selectedAction) : null;

  useEffect(() => {
    if (selectedActionId && !actions.some((action) => action.id === selectedActionId)) {
      setSelectedActionId(null);
    }
  }, [actions, selectedActionId]);

  const deleteSelectedAction = useCallback(() => {
    if (!selectedActionId) return;
    pushSnapshot();
    setActions((prev) => prev.filter((action) => action.id !== selectedActionId));
    setSelectedActionId(null);
  }, [pushSnapshot, selectedActionId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!selectedActionId || (event.key !== "Delete" && event.key !== "Backspace")) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tagName = target.tagName.toLowerCase();
        if (target.isContentEditable || tagName === "input" || tagName === "textarea") return;
      }
      event.preventDefault();
      deleteSelectedAction();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelectedAction, selectedActionId]);

  const toCanvasPoint = (clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const toCanvasCoords = (e: React.PointerEvent): Point => toCanvasPoint(e.clientX, e.clientY);

  const findActionAtPoint = useCallback(
    (point: Point, kinds?: Array<Action["kind"]>) => {
      for (let i = actions.length - 1; i >= 0; i -= 1) {
        const action = actions[i];
        if (kinds && !kinds.includes(action.kind)) continue;
        if (hitTestAction(action, point)) return action;
      }
      return null;
    },
    [actions],
  );

  const takeActionDragSnapshot = useCallback(
    (drag: ActionDrag) => {
      if (drag.snapshotTaken) return;
      pushSnapshot();
      drag.snapshotTaken = true;
    },
    [pushSnapshot],
  );

  const beginActionDrag = (
    e: React.PointerEvent,
    id: string,
    mode: ActionDrag["mode"],
    point = toCanvasCoords(e),
  ) => {
    const action = actions.find((item) => item.id === id);
    if (!action) return;
    const bounds = getActionBounds(action);
    const center = rectCenter(bounds);
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setSelectedActionId(id);
    actionDragRef.current = {
      mode,
      id,
      start: point,
      original: action,
      center,
      startAngle: Math.atan2(point.y - center.y, point.x - center.x),
      startDistance: Math.max(1, Math.hypot(point.x - center.x, point.y - center.y)),
      snapshotTaken: false,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const p = toCanvasCoords(e);
    if (imageLoading) return;

    if (tool === "move" || tool === "text") {
      const hit = findActionAtPoint(p, tool === "text" ? ["text"] : undefined);
      if (hit) {
        beginActionDrag(e, hit.id, "move", p);
        return;
      }
      if (tool === "move") {
        setSelectedActionId(null);
        return;
      }
    }

    if (tool === "brush" || tool === "eraser") {
      setSelectedActionId(null);
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      setDraftStroke({
        id: createActionId(),
        kind: "stroke",
        points: [p],
        color,
        width: strokeWidth,
        erase: tool === "eraser",
        rotation: 0,
      });
    } else if (tool === "text") {
      const text = window.prompt(t("studio.enterText"));
      if (text && text.trim()) {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        const trimmedText = text.trim();
        const size = measureTextSize(trimmedText, fontSize, ctx);
        const action: TextAction = {
          id: createActionId(),
          kind: "text",
          x: p.x,
          y: p.y,
          text: trimmedText,
          color,
          fontSize,
          width: size.w,
          height: size.h,
          rotation: 0,
        };
        pushSnapshot();
        setActions((prev) => [...prev, action]);
        setSelectedActionId(action.id);
      }
    } else if (tool === "crop") {
      setSelectedActionId(null);
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      if (cropRect && pointInRect(p, cropRect)) {
        cropDragRef.current = { mode: "move", start: p, original: cropRect };
        return;
      }
      const start = clampPointToImage(p, imageSize);
      cropStartRef.current = start;
      setCropRect({ x: start.x, y: start.y, w: 0, h: 0 });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = toCanvasCoords(e);
    const actionDrag = actionDragRef.current;
    if (actionDrag) {
      if (actionDrag.mode === "move") {
        const dx = p.x - actionDrag.start.x;
        const dy = p.y - actionDrag.start.y;
        if (Math.hypot(dx, dy) > 0.5) takeActionDragSnapshot(actionDrag);
        setActions((prev) =>
          prev.map((action) =>
            action.id === actionDrag.id ? translateAction(actionDrag.original, dx, dy) : action,
          ),
        );
      } else if (actionDrag.mode === "resize") {
        const distance = Math.max(
          1,
          Math.hypot(p.x - actionDrag.center.x, p.y - actionDrag.center.y),
        );
        const nextScale = clamp(
          distance / actionDrag.startDistance,
          MIN_ACTION_SCALE,
          MAX_ACTION_SCALE,
        );
        if (Math.abs(nextScale - 1) > 0.005) takeActionDragSnapshot(actionDrag);
        setActions((prev) =>
          prev.map((action) =>
            action.id === actionDrag.id
              ? resizeAction(actionDrag.original, nextScale, actionDrag.center)
              : action,
          ),
        );
      } else {
        const angle = Math.atan2(p.y - actionDrag.center.y, p.x - actionDrag.center.x);
        const rotation = actionDrag.original.rotation + angle - actionDrag.startAngle;
        if (Math.abs(rotation - actionDrag.original.rotation) > 0.005) {
          takeActionDragSnapshot(actionDrag);
        }
        setActions((prev) =>
          prev.map((action) =>
            action.id === actionDrag.id
              ? updateActionRotation(actionDrag.original, rotation)
              : action,
          ),
        );
      }
      return;
    }

    const cropDrag = cropDragRef.current;
    if (cropDrag) {
      if (cropDrag.mode === "move") {
        setCropRect(
          moveCropRect(
            cropDrag.original,
            p.x - cropDrag.start.x,
            p.y - cropDrag.start.y,
            imageSize,
          ),
        );
      } else if (cropDrag.corner) {
        setCropRect(resizeCropRect(cropDrag.original, cropDrag.corner, p, imageSize));
      }
      return;
    }

    if (draftStroke) {
      setDraftStroke((prev) => (prev ? { ...prev, points: [...prev.points, p] } : prev));
    } else if (tool === "crop" && cropStartRef.current) {
      const start = cropStartRef.current;
      const end = clampPointToImage(p, imageSize);
      setCropRect(
        clampRectToImage(
          { x: start.x, y: start.y, w: end.x - start.x, h: end.y - start.y },
          imageSize,
        ),
      );
    }
  };

  const onPointerUp = () => {
    actionDragRef.current = null;
    cropDragRef.current = null;
    if (draftStroke) {
      pushSnapshot();
      setActions((prev) => [...prev, draftStroke]);
      setDraftStroke(null);
    }
    if (tool === "crop") {
      cropStartRef.current = null;
    }
  };

  const undo = () => {
    setHistory((prevHistory) => {
      if (!prevHistory.length) return prevHistory;
      const last = prevHistory[prevHistory.length - 1];
      setRedoStack((r) => [...r, { baseSrc, filterSourceSrc, activeFilter, actions }]);
      setBaseSrc(last.baseSrc);
      setFilterSourceSrc(last.filterSourceSrc);
      setActiveFilter(last.activeFilter);
      setActions(last.actions);
      setSelectedActionId(null);
      return prevHistory.slice(0, -1);
    });
  };

  const redo = () => {
    setRedoStack((prevRedo) => {
      if (!prevRedo.length) return prevRedo;
      const last = prevRedo[prevRedo.length - 1];
      setHistory((h) => [...h, { baseSrc, filterSourceSrc, activeFilter, actions }]);
      setBaseSrc(last.baseSrc);
      setFilterSourceSrc(last.filterSourceSrc);
      setActiveFilter(last.activeFilter);
      setActions(last.actions);
      setSelectedActionId(null);
      return prevRedo.slice(0, -1);
    });
  };

  const flatten = useCallback(
    async (options: { restoreCropOverlay?: boolean } = {}): Promise<string | null> => {
      const c = canvasRef.current;
      if (!c) return null;
      await render({ includeCropOverlay: false });
      const dataUrl = c.toDataURL("image/png");
      if (cropRect && options.restoreCropOverlay !== false) void render();
      return dataUrl;
    },
    [cropRect, render],
  );

  const flattenBlob = useCallback(async (): Promise<Blob | null> => {
    const c = canvasRef.current;
    if (!c) return null;
    await render({ includeCropOverlay: false });
    const blob = await exportEditedCanvasBlob(c);
    if (cropRect) void render();
    return blob;
  }, [cropRect, render]);

  const applyFilter = async (filterCss: string) => {
    if (filterCss === activeFilter) return;
    pushSnapshot();
    setActiveFilter(filterCss);
    if (filterCss === "none") {
      setBaseSrc(filterSourceSrc);
      return;
    }
    const img = await loadImage(filterSourceSrc);
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.filter = filterCss;
    ctx.drawImage(img, 0, 0);
    const newSrc = c.toDataURL("image/png");
    setBaseSrc(newSrc);
  };

  const applyCrop = async () => {
    if (!cropRect || cropRect.w < 4 || cropRect.h < 4) {
      toast.error(t("studio.cropFirst"));
      return;
    }
    const flat = await flatten({ restoreCropOverlay: false });
    if (!flat) return;
    const img = await loadImage(flat);
    const c = document.createElement("canvas");
    c.width = Math.round(cropRect.w);
    c.height = Math.round(cropRect.h);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(
      img,
      cropRect.x,
      cropRect.y,
      cropRect.w,
      cropRect.h,
      0,
      0,
      cropRect.w,
      cropRect.h,
    );
    const newSrc = c.toDataURL("image/png");
    pushSnapshot();
    setBaseSrc(newSrc);
    setFilterSourceSrc(newSrc);
    setActiveFilter("none");
    setActions([]);
    setCropRect(null);
    setSelectedActionId(null);
  };

  const flattenStrokes = async () => {
    if (!actions.length) return;
    const flat = await flatten({ restoreCropOverlay: false });
    if (!flat) return;
    pushSnapshot();
    setBaseSrc(flat);
    setFilterSourceSrc(flat);
    setActiveFilter("none");
    setActions([]);
    setSelectedActionId(null);
  };

  const clearMarks = () => {
    if (!actions.length) return;
    pushSnapshot();
    setActions([]);
    setSelectedActionId(null);
  };

  const handleDownload = async () => {
    const url = await flatten();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `megick-edit-${Date.now()}.png`;
    a.click();
  };

  const handleSave = async () => {
    if (saving || exporting) return;
    setExporting(true);
    try {
      const blob = await flattenBlob();
      if (!blob) return;
      await onSave?.(blob);
    } finally {
      setExporting(false);
    }
  };

  const beginCropResize = (e: React.PointerEvent, corner: NonNullable<CropDrag["corner"]>) => {
    if (!cropRect) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    cropDragRef.current = {
      mode: "resize",
      start: toCanvasCoords(e),
      original: cropRect,
      corner,
    };
  };

  const fitW = imageSize.w * scale;
  const fitH = imageSize.h * scale;
  const selectedBoxStyle =
    selectedAction && selectedBounds
      ? {
          left: selectedBounds.x * scale,
          top: selectedBounds.y * scale,
          width: selectedBounds.w * scale,
          height: selectedBounds.h * scale,
          transform: `rotate(${selectedAction.rotation}rad)`,
        }
      : undefined;
  const cropBoxStyle = cropRect
    ? {
        left: cropRect.x * scale,
        top: cropRect.y * scale,
        width: cropRect.w * scale,
        height: cropRect.h * scale,
      }
    : undefined;

  const cursorClass = useMemo(() => {
    switch (tool) {
      case "brush":
      case "eraser":
        return "cursor-crosshair";
      case "text":
        return "cursor-text";
      case "crop":
        return "cursor-crosshair";
      case "move":
        return "cursor-grab";
      default:
        return "cursor-default";
    }
  }, [tool]);
  const saveBusy = saving || exporting;

  return (
    <div className="flex h-full w-full flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-secondary/30 p-2">
        <ToolButton
          active={tool === "brush"}
          onClick={() => setTool("brush")}
          title={t("studio.tool.brush")}
          icon={<Brush className="h-4 w-4" />}
        />
        <ToolButton
          active={tool === "eraser"}
          onClick={() => setTool("eraser")}
          title={t("studio.tool.eraser")}
          icon={<Eraser className="h-4 w-4" />}
        />
        <ToolButton
          active={tool === "text"}
          onClick={() => setTool("text")}
          title={t("studio.tool.text")}
          icon={<TypeIcon className="h-4 w-4" />}
        />
        <ToolButton
          active={tool === "crop"}
          onClick={() => setTool("crop")}
          title={t("studio.tool.crop")}
          icon={<Crop className="h-4 w-4" />}
        />
        <ToolButton
          active={tool === "move"}
          onClick={() => setTool("move")}
          title={t("studio.tool.view")}
          icon={<Move className="h-4 w-4" />}
        />

        <div className="mx-1 h-6 w-px bg-border" />

        <div className="flex items-center gap-1">
          {COLOR_SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              title={c}
              className={`h-6 w-6 rounded-full border-2 transition ${
                color === c ? "border-primary scale-110" : "border-border/50"
              }`}
              style={{ background: c }}
            />
          ))}
          <label className="relative ml-1 inline-flex h-6 w-6 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-border/50 bg-background">
            <PaintBucket className="h-3 w-3 text-muted-foreground" />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
        </div>

        <div className="mx-1 h-6 w-px bg-border" />

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{t("studio.stroke")}</span>
          <div className="w-24">
            <Slider
              value={[strokeWidth]}
              onValueChange={(v) => setStrokeWidth(v[0])}
              min={1}
              max={48}
              step={1}
            />
          </div>
          <span className="tabular-nums">{strokeWidth}px</span>
        </div>

        {tool === "text" ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t("studio.fontSize")}</span>
            <div className="w-20">
              <Slider
                value={[fontSize]}
                onValueChange={(v) => setFontSize(v[0])}
                min={12}
                max={120}
                step={2}
              />
            </div>
            <span className="tabular-nums">{fontSize}px</span>
          </div>
        ) : null}

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={undo}
            disabled={!history.length}
            title={t("studio.undo")}
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={redo}
            disabled={!redoStack.length}
            title={t("studio.redo")}
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={clearMarks} title={t("studio.clearMarks")}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            title={t("studio.downloadPng")}
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Crop confirm bar */}
      {tool === "crop" ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-xs text-primary">
          <span>{t("studio.cropInstruction")}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setCropRect(null)}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={applyCrop} className="bg-gradient-primary shadow-glow">
              <Crop className="mr-1.5 h-3.5 w-3.5" /> {t("studio.applyCrop")}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Canvas viewport */}
      <div
        ref={containerRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl border border-border/70 bg-[radial-gradient(circle_at_center,rgba(120,40,200,0.12),transparent_70%)] p-2"
      >
        {fitW && fitH ? (
          <>
            <div className="relative shrink-0" style={{ width: fitW, height: fitH }}>
              <canvas
                ref={canvasRef}
                width={imageSize.w || 1}
                height={imageSize.h || 1}
                onPointerDown={onPointerDown}
                className={`${cursorClass} h-full w-full touch-none select-none rounded-xl shadow-2xl transition-opacity ${
                  imageLoading ? "opacity-30" : "opacity-100"
                }`}
              />
              {selectedAction && selectedBounds && selectedBoxStyle ? (
                <div className="pointer-events-none absolute inset-0">
                  <div
                    className="absolute min-h-6 min-w-6 border border-primary shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_0_20px_oklch(0.66_0.19_42_/_0.35)] dark:shadow-[0_0_0_1px_rgba(0,0,0,0.45),0_0_20px_oklch(0.84_0.16_88_/_0.35)]"
                    style={{
                      ...selectedBoxStyle,
                      transformOrigin: "center",
                    }}
                  >
                    <button
                      type="button"
                      title={t("studio.rotateSelected")}
                      onPointerDown={(event) => beginActionDrag(event, selectedAction.id, "rotate")}
                      className="pointer-events-auto absolute -top-9 left-1/2 inline-flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-primary/70 bg-background/95 text-primary shadow-lg backdrop-blur hover:bg-primary/15"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title={t("studio.deleteSelected")}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        deleteSelectedAction();
                      }}
                      className="pointer-events-auto absolute -right-3 -top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-destructive/70 bg-background/95 text-destructive shadow-lg backdrop-blur hover:bg-destructive/15"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title={t("studio.resizeSelected")}
                      onPointerDown={(event) => beginActionDrag(event, selectedAction.id, "resize")}
                      className="pointer-events-auto absolute -bottom-3 -right-3 inline-flex h-7 w-7 cursor-nwse-resize items-center justify-center rounded-full border border-primary/70 bg-background/95 text-primary shadow-lg backdrop-blur hover:bg-primary/15"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : null}
              {tool === "crop" && cropRect && cropBoxStyle && cropRect.w > 0 && cropRect.h > 0 ? (
                <div className="pointer-events-none absolute inset-0">
                  <div
                    className="absolute border border-primary shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
                    style={cropBoxStyle}
                  >
                    {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                      <button
                        key={corner}
                        type="button"
                        title={t("studio.resizeCrop")}
                        onPointerDown={(event) => beginCropResize(event, corner)}
                        className={`pointer-events-auto absolute h-4 w-4 rounded-full border border-primary bg-background shadow-lg ${
                          corner === "nw"
                            ? "-left-2 -top-2 cursor-nwse-resize"
                            : corner === "ne"
                              ? "-right-2 -top-2 cursor-nesw-resize"
                              : corner === "sw"
                                ? "-bottom-2 -left-2 cursor-nesw-resize"
                                : "-bottom-2 -right-2 cursor-nwse-resize"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            {imageLoading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-background/35 backdrop-blur-sm">
                <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-xs text-muted-foreground shadow-lg">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  {t("studio.loadingImage")}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-5 w-5 animate-pulse" />
            {t("studio.loadingImage")}
          </div>
        )}
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-secondary/20 p-2">
        <span className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("studio.filters")}
        </span>
        {FILTER_PRESETS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => applyFilter(f.css)}
            className={`rounded-md border px-2 py-1 text-xs transition ${
              activeFilter === f.css
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border bg-background/40 text-muted-foreground hover:border-primary hover:text-foreground"
            }`}
          >
            {t(filterLabelKey(f.id))}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={flattenStrokes} disabled={!actions.length}>
            <ImageDown className="mr-1.5 h-3.5 w-3.5" />
            {t("studio.flatten")}
          </Button>
          {onClose ? (
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="mr-1.5 h-3.5 w-3.5" /> {t("common.close")}
            </Button>
          ) : null}
          {onSave ? (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveBusy}
              className="bg-gradient-primary shadow-glow hover:opacity-90"
            >
              {saveBusy ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              {t("studio.saveNewVersion")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  title,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition ${
        active
          ? "border-primary bg-primary/15 text-foreground shadow-glow"
          : "border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      {icon}
    </button>
  );
}
