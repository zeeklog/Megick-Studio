"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { EditorCore } from "@/megickcut/core";
import { useEditor } from "@/megickcut/editor/use-editor";
import { useKeybindingsListener } from "@/megickcut/actions/use-keybindings";
import { useKeybindingsStore } from "@/megickcut/actions/keybindings-store";
import { useTimelineStore } from "@/megickcut/timeline/timeline-store";
import { useEditorActions } from "@/megickcut/actions/use-editor-actions";
import { loadFontAtlas } from "@/megickcut/fonts/google-fonts";
import { initializeGpuRenderer, isGpuAvailable } from "@/megickcut/services/renderer/gpu-renderer";
import { getInitialLocale, translate, useI18n } from "@/lib/i18n";

interface EditorProviderProps {
  projectId: string;
  projectName?: string;
  embedded?: boolean;
  children: ReactNode;
}

export function EditorProvider({
  projectId,
  projectName = translate(getInitialLocale(), "editor.project.defaultName"),
  embedded = false,
  children,
}: EditorProviderProps) {
  const { t } = useI18n();
  const activeProject = useEditor((e) => e.project.getActiveOrNull());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { setLoadingProject } = useKeybindingsStore();

  useEffect(() => {
    setLoadingProject(isLoading);
  }, [isLoading, setLoadingProject]);

  useEffect(() => {
    let cancelled = false;
    const editor = EditorCore.getInstance();

    const loadProject = async () => {
      try {
        setIsLoading(true);
        await initializeGpuRenderer();
        editor.renderer.setDegraded(!isGpuAvailable());
        await editor.project.loadProject({ id: projectId, silentNotFound: true });

        if (cancelled) return;

        setIsLoading(false);
        loadFontAtlas();
      } catch (err) {
        if (cancelled) return;

        const isNotFound =
          err instanceof Error &&
          (err.message.includes("not found") || err.message.includes("does not exist"));

        if (isNotFound) {
          try {
            await editor.project.createNewProject({
              id: projectId,
              name: projectName,
            });
            if (cancelled) return;
            setIsLoading(false);
            loadFontAtlas();
          } catch (_createErr) {
            setError(t("editor.error.createProject"));
            setIsLoading(false);
          }
        } else {
          const wasmPanic = (window as Window & { __wasmPanic?: string }).__wasmPanic;
          if (wasmPanic) {
            delete (window as Window & { __wasmPanic?: string }).__wasmPanic;
            setError(wasmPanic);
          } else {
            setError(err instanceof Error ? err.message : t("editor.error.loadProject"));
          }
          setIsLoading(false);
        }
      }
    };

    loadProject();

    return () => {
      cancelled = true;
    };
  }, [projectId, projectName, t]);

  const containerClassName = embedded ? "h-full w-full" : "h-screen w-screen";

  if (error) {
    return (
      <div className={`bg-background flex ${containerClassName} items-center justify-center`}>
        <div className="flex flex-col items-center gap-4">
          <p className="text-destructive text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`bg-background flex ${containerClassName} items-center justify-center`}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="text-muted-foreground size-8 animate-spin" />
          <p className="text-muted-foreground text-sm">{t("editor.loading.editor")}</p>
        </div>
      </div>
    );
  }

  if (!activeProject) {
    return (
      <div className={`bg-background flex ${containerClassName} items-center justify-center`}>
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="text-muted-foreground size-8 animate-spin" />
          <p className="text-muted-foreground text-sm">{t("editor.loading.closing")}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <EditorRuntimeBindings />
      {children}
    </>
  );
}

function EditorRuntimeBindings() {
  const editor = useEditor();
  const rippleEditingEnabled = useTimelineStore((state) => state.rippleEditingEnabled);

  useEffect(() => {
    editor.command.isRippleEnabled = rippleEditingEnabled;
  }, [editor, rippleEditingEnabled]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!editor.save.getIsDirty()) return;
      event.preventDefault();
      (event as unknown as { returnValue: string }).returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [editor]);

  useEditorActions();
  useKeybindingsListener();
  return null;
}
