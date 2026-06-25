import type { StudioResult } from "@/routes/-dashboard-types";

export type CanvasTool = "select" | "pan";
export type CanvasItemStatus = "loading" | "ready" | "failed";
export type CanvasItemSource = "generation" | "upload";

export type CanvasRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasItem = CanvasRect & {
  id: string;
  src: string;
  fallbackSrc?: string;
  prompt: string;
  status: CanvasItemStatus;
  source: CanvasItemSource;
  result?: StudioResult;
  hiddenFromCanvas?: boolean;
};

export type CanvasResizeHandle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

export type CanvasAlignment =
  | "left"
  | "right"
  | "horizontalCenter"
  | "top"
  | "bottom"
  | "verticalCenter"
  | "verticalStack";

export type CanvasUploadInput = {
  src: string;
  prompt?: string;
  width?: number;
  height?: number;
};
