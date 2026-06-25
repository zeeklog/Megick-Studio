import type { ElementType } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  Folder03Icon,
  Happy01Icon,
  MagicWand05Icon,
  TextIcon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { TranslationKey } from "@/lib/i18n";

export const TAB_KEYS = ["media", "text", "stickers", "effects", "settings"] as const;

export type Tab = (typeof TAB_KEYS)[number];

const createHugeiconsIcon =
  ({ icon }: { icon: IconSvgElement }) =>
  ({ className }: { className?: string }) => <HugeiconsIcon icon={icon} className={className} />;

export const tabs = {
  media: {
    icon: createHugeiconsIcon({ icon: Folder03Icon }),
    labelKey: "editor.tabs.media",
  },
  text: {
    icon: createHugeiconsIcon({ icon: TextIcon }),
    labelKey: "editor.tabs.text",
  },
  stickers: {
    icon: createHugeiconsIcon({ icon: Happy01Icon }),
    labelKey: "editor.tabs.stickers",
  },
  effects: {
    icon: createHugeiconsIcon({ icon: MagicWand05Icon }),
    labelKey: "editor.tabs.effects",
  },
  settings: {
    icon: createHugeiconsIcon({ icon: Settings01Icon }),
    labelKey: "editor.tabs.settings",
  },
} satisfies Record<Tab, { icon: ElementType<{ className?: string }>; labelKey: TranslationKey }>;

export type MediaViewMode = "grid" | "list";
export type MediaSortKey = "name" | "type" | "duration" | "size";
export type MediaSortOrder = "asc" | "desc";
export type PendingMediaImportStatus = "importing" | "failed";

export interface PendingMediaImport {
  sourceKey: string;
  kind: "image" | "video";
  status: PendingMediaImportStatus;
  startedAt: number;
  name?: string;
  prompt?: string;
  sessionTitle?: string;
  error?: string;
}

type PendingMediaImportInput = Omit<PendingMediaImport, "status" | "startedAt">;

interface AssetsPanelStore {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  highlightMediaId: string | null;
  requestRevealMedia: (mediaId: string) => void;
  clearHighlight: () => void;

  /* Media */
  mediaViewMode: MediaViewMode;
  setMediaViewMode: (mode: MediaViewMode) => void;
  mediaSortBy: MediaSortKey;
  mediaSortOrder: MediaSortOrder;
  setMediaSort: (args: { key: MediaSortKey; order: MediaSortOrder }) => void;
  pendingMediaImports: Record<string, PendingMediaImport>;
  beginPendingMediaImport: (item: PendingMediaImportInput) => void;
  completePendingMediaImport: (sourceKey: string) => void;
  failPendingMediaImport: (sourceKey: string, error?: string) => void;
  clearPendingMediaImport: (sourceKey: string) => void;
  clearPendingMediaImports: () => void;
}

export const useAssetsPanelStore = create<AssetsPanelStore>()(
  persist(
    (set) => ({
      activeTab: "media",
      setActiveTab: (tab) => set({ activeTab: tab }),
      highlightMediaId: null,
      requestRevealMedia: (mediaId) => set({ activeTab: "media", highlightMediaId: mediaId }),
      clearHighlight: () => set({ highlightMediaId: null }),
      mediaViewMode: "grid",
      setMediaViewMode: () => set({ mediaViewMode: "grid" }),
      mediaSortBy: "name",
      mediaSortOrder: "asc",
      setMediaSort: ({ key, order }) => set({ mediaSortBy: key, mediaSortOrder: order }),
      pendingMediaImports: {},
      beginPendingMediaImport: (item) =>
        set((state) => {
          const existing = state.pendingMediaImports[item.sourceKey];
          return {
            activeTab: "media",
            pendingMediaImports: {
              ...state.pendingMediaImports,
              [item.sourceKey]: {
                ...existing,
                ...item,
                status: "importing",
                startedAt: existing?.status === "importing" ? existing.startedAt : Date.now(),
                error: undefined,
              },
            },
          };
        }),
      completePendingMediaImport: (sourceKey) =>
        set((state) => {
          if (!state.pendingMediaImports[sourceKey]) return state;
          const { [sourceKey]: _removed, ...pendingMediaImports } = state.pendingMediaImports;
          return { pendingMediaImports };
        }),
      failPendingMediaImport: (sourceKey, error) =>
        set((state) => {
          const existing = state.pendingMediaImports[sourceKey];
          if (!existing) return state;
          return {
            activeTab: "media",
            pendingMediaImports: {
              ...state.pendingMediaImports,
              [sourceKey]: {
                ...existing,
                status: "failed",
                error,
              },
            },
          };
        }),
      clearPendingMediaImport: (sourceKey) =>
        set((state) => {
          if (!state.pendingMediaImports[sourceKey]) return state;
          const { [sourceKey]: _removed, ...pendingMediaImports } = state.pendingMediaImports;
          return { pendingMediaImports };
        }),
      clearPendingMediaImports: () => set({ pendingMediaImports: {} }),
    }),
    {
      name: "assets-panel",
      partialize: (state) => ({
        mediaSortBy: state.mediaSortBy,
        mediaSortOrder: state.mediaSortOrder,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<AssetsPanelStore>),
        mediaViewMode: "grid",
      }),
    },
  ),
);
