import { useCallback, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export const PREVIEW_TOOLBAR_CLASS =
  "flex flex-wrap justify-end gap-1.5 rounded-2xl border border-white/25 bg-white/[0.18] p-1.5 text-white shadow-[0_18px_50px_rgba(0,0,0,0.18)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/15 dark:bg-black/[0.18]";
export const PREVIEW_TOOL_BUTTON_CLASS =
  "border border-white/20 bg-white/[0.16] text-white shadow-sm backdrop-blur-xl hover:bg-white/[0.28] hover:text-white dark:border-white/15 dark:bg-white/[0.10]";
export const PREVIEW_TOOL_ACCENT_BUTTON_CLASS =
  "border border-white/22 bg-white/[0.18] text-white shadow-sm backdrop-blur-xl hover:bg-white/[0.30] hover:text-white dark:border-white/15 dark:bg-white/[0.12]";
export const PREVIEW_TOOL_DANGER_BUTTON_CLASS =
  "border border-white/20 bg-white/[0.16] text-white shadow-sm backdrop-blur-xl hover:bg-destructive/25 hover:text-white dark:border-white/15 dark:bg-white/[0.10]";
const PREVIEW_TOOL_TOGGLE_BUTTON_CLASS = `${PREVIEW_TOOL_BUTTON_CLASS} h-8 w-8 px-0`;
const PREVIEW_TOOLBAR_VISIBILITY_STORAGE_KEY = "megick.studio.previewToolbarVisible";

function readPreviewToolbarVisiblePreference() {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(PREVIEW_TOOLBAR_VISIBILITY_STORAGE_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

function writePreviewToolbarVisiblePreference(visible: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREVIEW_TOOLBAR_VISIBILITY_STORAGE_KEY, String(visible));
  } catch {
    // localStorage may be unavailable in private browsing.
  }
}

export function usePreviewToolbarVisibility() {
  const [toolbarVisible, setToolbarVisibleState] = useState(readPreviewToolbarVisiblePreference);
  const setToolbarVisible = useCallback((visible: boolean) => {
    setToolbarVisibleState(visible);
    writePreviewToolbarVisiblePreference(visible);
  }, []);

  return [toolbarVisible, setToolbarVisible] as const;
}

export function PreviewToolbarToggle({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const label = visible ? t("studio.hidePreviewToolbar") : t("studio.showPreviewToolbar");

  return (
    <Button
      size="icon"
      variant="ghost"
      aria-label={label}
      title={label}
      onClick={onToggle}
      className={PREVIEW_TOOL_TOGGLE_BUTTON_CLASS}
    >
      {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </Button>
  );
}
