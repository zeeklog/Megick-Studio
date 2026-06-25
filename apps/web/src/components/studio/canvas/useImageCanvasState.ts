import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { StudioResult } from "@/routes/-dashboard-types";
import { ratioParts } from "@/components/studio/panel/utils";
import type {
  CanvasAlignment,
  CanvasItem,
  CanvasRect,
  CanvasTool,
  CanvasUploadInput,
} from "./types";

const DEFAULT_ITEM_WIDTH = 320;
const DEFAULT_ITEM_GAP = 40;
const DEFAULT_ITEM_Y = 120;
const MIN_ITEM_SIZE = 72;
const HISTORY_LIMIT = 60;

type CanvasSnapshot = {
  layouts: Record<string, CanvasRect>;
  hiddenIds: string[];
  uploads: CanvasItem[];
};

type UseImageCanvasStateInput = {
  results: StudioResult[];
  pending?: Array<{ id: string; prompt: string; ratio: string }>;
  storageKey?: string;
};

function rectForRatio(ratio: string) {
  const parts = ratioParts(ratio);
  const width = DEFAULT_ITEM_WIDTH;
  return {
    width,
    height: Math.max(MIN_ITEM_SIZE, Math.round(width / parts.value)),
  };
}

function fallbackRect(index: number, ratio = "1:1") {
  const size = rectForRatio(ratio);
  return {
    x: 360 + index * (size.width + DEFAULT_ITEM_GAP),
    y: DEFAULT_ITEM_Y,
    ...size,
  };
}

function rightEdge(items: CanvasItem[]) {
  if (!items.length) return 320;
  return Math.max(...items.map((item) => item.x + item.width));
}

function snapshotFromState(
  layouts: Record<string, CanvasRect>,
  hiddenIds: Set<string>,
  uploads: CanvasItem[],
): CanvasSnapshot {
  return {
    layouts,
    hiddenIds: [...hiddenIds],
    uploads,
  };
}

function readSnapshot(storageKey?: string): CanvasSnapshot | null {
  if (!storageKey || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CanvasSnapshot;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeSnapshot(storageKey: string | undefined, snapshot: CanvasSnapshot) {
  if (!storageKey || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch {
    // Session storage can be unavailable in private browsing.
  }
}

function normalizeRect(rect: CanvasRect): CanvasRect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(MIN_ITEM_SIZE, Math.round(rect.width)),
    height: Math.max(MIN_ITEM_SIZE, Math.round(rect.height)),
  };
}

function rectsIntersect(a: CanvasRect, b: CanvasRect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function useImageCanvasState({ results, pending = [], storageKey }: UseImageCanvasStateInput) {
  const initialSnapshotRef = useRef<CanvasSnapshot | null>(null);
  if (initialSnapshotRef.current === null) initialSnapshotRef.current = readSnapshot(storageKey);

  const [layouts, setLayouts] = useState<Record<string, CanvasRect>>(
    () => initialSnapshotRef.current?.layouts ?? {},
  );
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(
    () => new Set(initialSnapshotRef.current?.hiddenIds ?? []),
  );
  const [uploads, setUploads] = useState<CanvasItem[]>(() => initialSnapshotRef.current?.uploads ?? []);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [tool, setTool] = useState<CanvasTool>("select");
  const [undoStack, setUndoStack] = useState<CanvasSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<CanvasSnapshot[]>([]);

  const visibleGeneratedItems = useMemo(() => {
    const generated: CanvasItem[] = [];
    const visibleResults = results.filter((result) => result.kind === "image");
    visibleResults.forEach((result, index) => {
      const rect = layouts[result.id] ?? fallbackRect(index);
      generated.push({
        id: result.id,
        src: result.src,
        fallbackSrc: result.fallbackSrc,
        prompt: result.prompt,
        status: "ready",
        source: "generation",
        result,
        hiddenFromCanvas: hiddenIds.has(result.id),
        ...rect,
      });
    });
    return generated;
  }, [hiddenIds, layouts, results]);

  const items = useMemo(() => {
    const base = [...visibleGeneratedItems, ...uploads];
    const currentRightEdge = rightEdge(base.filter((item) => !item.hiddenFromCanvas));
    const pendingItems = pending.map((item, index): CanvasItem => {
      const rect = layouts[item.id] ?? {
        ...rectForRatio(item.ratio),
        x: currentRightEdge + DEFAULT_ITEM_GAP + index * (DEFAULT_ITEM_WIDTH + DEFAULT_ITEM_GAP),
        y: DEFAULT_ITEM_Y,
      };
      return {
        id: item.id,
        src: "",
        prompt: item.prompt,
        status: "loading",
        source: "generation",
        hiddenFromCanvas: hiddenIds.has(item.id),
        ...rect,
      };
    });
    return [...base, ...pendingItems].filter((item) => !item.hiddenFromCanvas);
  }, [hiddenIds, layouts, pending, uploads, visibleGeneratedItems]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  );

  const pushHistory = useCallback(() => {
    const snapshot = snapshotFromState(layouts, hiddenIds, uploads);
    setUndoStack((prev) => [...prev.slice(-HISTORY_LIMIT + 1), snapshot]);
    setRedoStack([]);
  }, [hiddenIds, layouts, uploads]);

  const applySnapshot = useCallback((snapshot: CanvasSnapshot) => {
    setLayouts(snapshot.layouts);
    setHiddenIds(new Set(snapshot.hiddenIds));
    setUploads(snapshot.uploads);
    setSelectedIds((prev) => {
      const available = new Set([
        ...Object.keys(snapshot.layouts),
        ...snapshot.uploads.map((item) => item.id),
      ]);
      return new Set([...prev].filter((id) => available.has(id) && !snapshot.hiddenIds.includes(id)));
    });
  }, []);

  const updateItemRects = useCallback(
    (patches: Record<string, CanvasRect>) => {
      pushHistory();
      setLayouts((prev) => {
        const next = { ...prev };
        for (const [id, rect] of Object.entries(patches)) next[id] = normalizeRect(rect);
        return next;
      });
      setUploads((prev) =>
        prev.map((item) => (patches[item.id] ? { ...item, ...normalizeRect(patches[item.id]) } : item)),
      );
    },
    [pushHistory],
  );

  const selectOnly = useCallback((id: string | null) => {
    setSelectedIds(id ? new Set([id]) : new Set());
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectMany = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids));
  }, []);

  const selectIntersecting = useCallback(
    (rect: CanvasRect) => {
      setSelectedIds(new Set(items.filter((item) => rectsIntersect(item, rect)).map((item) => item.id)));
    },
    [items],
  );

  const hideItems = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      pushHistory();
      setHiddenIds((prev) => new Set([...prev, ...ids]));
      setSelectedIds((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
    },
    [pushHistory],
  );

  const restoreItems = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      pushHistory();
      setHiddenIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    },
    [pushHistory],
  );

  const addUpload = useCallback(
    (input: CanvasUploadInput) => {
      pushHistory();
      const id = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const width = input.width ?? DEFAULT_ITEM_WIDTH;
      const height = input.height ?? input.width ?? DEFAULT_ITEM_WIDTH;
      const item: CanvasItem = {
        id,
        src: input.src,
        prompt: input.prompt ?? "Uploaded image",
        status: "ready",
        source: "upload",
        x: rightEdge(items) + DEFAULT_ITEM_GAP,
        y: DEFAULT_ITEM_Y,
        width,
        height,
      };
      setUploads((prev) => [...prev, item]);
      setSelectedIds(new Set([id]));
    },
    [items, pushHistory],
  );

  const alignSelected = useCallback(
    (alignment: CanvasAlignment) => {
      if (selectedItems.length < 2) return;
      const box = boundingRect(selectedItems);
      const patches: Record<string, CanvasRect> = {};
      if (alignment === "verticalStack") {
        const sorted = [...selectedItems].sort((a, b) => a.y - b.y || a.x - b.x);
        let y = box.y;
        sorted.forEach((item) => {
          patches[item.id] = { ...item, x: box.x + (box.width - item.width) / 2, y };
          y += item.height + 16;
        });
      } else {
        selectedItems.forEach((item) => {
          const next = { ...item };
          if (alignment === "left") next.x = box.x;
          if (alignment === "right") next.x = box.x + box.width - item.width;
          if (alignment === "horizontalCenter") next.x = box.x + (box.width - item.width) / 2;
          if (alignment === "top") next.y = box.y;
          if (alignment === "bottom") next.y = box.y + box.height - item.height;
          if (alignment === "verticalCenter") next.y = box.y + (box.height - item.height) / 2;
          patches[item.id] = next;
        });
      }
      updateItemRects(patches);
    },
    [selectedItems, updateItemRects],
  );

  const undo = useCallback(() => {
    setUndoStack((prev) => {
      const snapshot = prev[prev.length - 1];
      if (!snapshot) return prev;
      setRedoStack((redo) => [...redo, snapshotFromState(layouts, hiddenIds, uploads)]);
      applySnapshot(snapshot);
      return prev.slice(0, -1);
    });
  }, [applySnapshot, hiddenIds, layouts, uploads]);

  const redo = useCallback(() => {
    setRedoStack((prev) => {
      const snapshot = prev[prev.length - 1];
      if (!snapshot) return prev;
      setUndoStack((undoItems) => [...undoItems, snapshotFromState(layouts, hiddenIds, uploads)]);
      applySnapshot(snapshot);
      return prev.slice(0, -1);
    });
  }, [applySnapshot, hiddenIds, layouts, uploads]);

  useEffect(() => {
    writeSnapshot(storageKey, snapshotFromState(layouts, hiddenIds, uploads));
  }, [hiddenIds, layouts, storageKey, uploads]);

  useEffect(() => {
    const visibleIds = new Set(items.map((item) => item.id));
    setSelectedIds((prev) => new Set([...prev].filter((id) => visibleIds.has(id))));
  }, [items]);

  return {
    items,
    selectedIds,
    selectedItems,
    tool,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    hiddenIds,
    setTool,
    selectOnly,
    toggleSelected,
    selectMany,
    selectIntersecting,
    updateItemRects,
    hideItems,
    restoreItems,
    addUpload,
    alignSelected,
    undo,
    redo,
  };
}

export function boundingRect(items: CanvasRect[]): CanvasRect {
  if (!items.length) return { x: 0, y: 0, width: 0, height: 0 };
  const left = Math.min(...items.map((item) => item.x));
  const top = Math.min(...items.map((item) => item.y));
  const right = Math.max(...items.map((item) => item.x + item.width));
  const bottom = Math.max(...items.map((item) => item.y + item.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
