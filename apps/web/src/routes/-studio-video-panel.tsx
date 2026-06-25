import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { AIModelPublic, GenerationJobPublic, PromptTemplatePublic } from "@megick/api-types";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { modelDisplayName } from "@/lib/model-display";
import {
  type StudioMode,
  type StudioSettings,
  type StudioResult,
  clampStudioVideoDuration,
  VIDEO_DURATION_MAX_SECONDS,
  VIDEO_DURATION_MIN_SECONDS,
  newStudioId,
} from "@/routes/-dashboard-types";
import {
  modelCreditLabel,
  createDefaultVideoDrafts,
  defaultVideoModeForModels,
  defaultVideoSettingsForMode,
  estimatedGenerationCredits,
  extensionFromName,
  handoffReferenceName,
  mediaKindFromUrl,
  normalizeReferenceInput,
  normalizeVideoDraft,
  normalizeVideoMode,
  readImageDimensions,
  referenceBoundsForModel,
  referenceKindFromFile,
  referenceMediaTypeFor,
  refsFromGenerationJobParams,
  settingsPatchFromGenerationJob,
  withVideoReferenceTypes,
} from "@/components/studio/panel/utils";
import type {
  ConcreteVideoInputMode,
  StudioReferenceKind,
  StudioResultAction,
  StudioVideoMediaType,
  VideoModeDraft,
  VideoModeDrafts,
} from "@/components/studio/panel/types";
import {
  MAX_STUDIO_REFERENCE_MEDIA,
  STUDIO_REFERENCE_IMAGE_MAX_BYTES,
  STUDIO_REFERENCE_VIDEO_MAX_BYTES,
  STUDIO_VIDEO_REFERENCE_IMAGE_MIN_DIMENSION,
  VIDEO_REFERENCE_VIDEO_GENERATION_MAX_SECONDS,
  VIDEO_REFERENCE_VIDEO_GENERATION_MIN_SECONDS,
  STUDIO_REFERENCE_IMAGE_EXTENSIONS,
  STUDIO_REFERENCE_VIDEO_EXTENSIONS,
  VIDEO_INPUT_MODES,
} from "@/components/studio/panel/constants";
import {
  EmptyPreview,
  FailedJobPreview,
  ImagePreviewPanel,
  StudioJobHistoryStrip,
  VideoPreviewPanel,
} from "@/components/studio/panel/preview-panels";
import { VideoGenerationPanel } from "@/components/studio/panel/video-generation-panel";
import { TemplateCenterDialog } from "@/components/studio/panel/template-center-dialog";
import { MediaCenterDialog } from "@/components/studio/panel/media-center-dialog";
import { ReferenceUploadDialog } from "@/components/studio/panel/reference-upload-dialog";
import { ZoomPreviewDialog } from "@/components/studio/panel/zoom-preview-dialog";
import {
  type UseStudioSessionParams,
  useStudioSession,
  fetchMediaBlob,
  mediaExtension,
  saveBlob,
  referenceSrcFromBlob,
  referenceSrcFromResult,
  objectUrlFromBlob,
} from "./-studio-shared";
import type { TemplateSearch } from "./dashboard.templates.index";

interface VideoStudioPanelProps {
  sessionId?: string;
  userId?: string;
  newSession?: boolean;
  onboardingDemo?: boolean;
  autoSubmit?: boolean;
  focusJobId?: string;
  templateId?: string;
  handoffId?: string;
  sourceImage?: string;
  sourceImageName?: string;
  searchVideoInputMode?: ConcreteVideoInputMode;
  searchPrompt?: string;
  prompt: string;
  setPrompt: (value: string) => void;
  settings: StudioSettings;
  setSettings: (settings: StudioSettings) => void;
  models: AIModelPublic[];
  modelsLoading: boolean;
  videoGenerationEnabled: boolean;
  hasAdvancedAccess: boolean;
  embedded?: boolean;
  resultActionLabel?: string;
  onResultAction?: StudioResultAction;
}

function useStackedWorkspaceLayout() {
  const [stacked, setStacked] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setStacked(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return stacked;
}

export function VideoStudioPanel({
  sessionId,
  userId,
  newSession: newSessionFromSearch,
  onboardingDemo,
  autoSubmit,
  focusJobId,
  templateId,
  handoffId,
  sourceImage,
  sourceImageName,
  searchVideoInputMode,
  searchPrompt,
  prompt,
  setPrompt,
  settings,
  setSettings,
  models,
  modelsLoading,
  videoGenerationEnabled,
  hasAdvancedAccess,
  embedded = false,
  resultActionLabel,
  onResultAction,
}: VideoStudioPanelProps) {
  const { locale, t, formatNumber } = useI18n();
  const navigate = useNavigate();
  const stackedLayout = useStackedWorkspaceLayout();

  // ── Video-specific state ────────────────────────────────────────
  const referenceFileInputRef = useRef<HTMLInputElement>(null);
  const handoffAppliedRef = useRef<string | null>(null);
  const templateAppliedRef = useRef<string | null>(null);
  const autoSubmitRequestedRef = useRef<string | null>(null);

  const [videoDrafts, setVideoDrafts] = useState<VideoModeDrafts>(() =>
    createDefaultVideoDrafts(settings),
  );
  const videoDraftsRef = useRef<VideoModeDrafts>(videoDrafts);
  const [referenceDialogOpen, setReferenceDialogOpen] = useState(false);
  const [referenceUploading, setReferenceUploading] = useState(false);
  const [mediaCenterOpen, setMediaCenterOpen] = useState(false);
  const [promptTipsOpen, setPromptTipsOpen] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState<TemplateSearch>(() => ({ type: "video" }));

  // Derived video state
  const allVideoModels = useMemo(
    () => models.filter((m) => m.category === "IMAGE2VIDEO"),
    [models],
  );
  const selectedVideoMode = normalizeVideoMode(
    settings.videoInputMode ?? defaultVideoModeForModels(allVideoModels),
  ) as ConcreteVideoInputMode;

  const activeVideoDraft = videoDrafts[selectedVideoMode];
  const activeVideoSettings = activeVideoDraft.settings;
  const activeVideoRefs = activeVideoDraft.refs;
  const activeVideoPrompt = activeVideoDraft.prompt;
  const activeVideoReferenceUrlInput = activeVideoDraft.referenceUrlInput;

  const updateVideoDraft = useCallback(
    (mode: ConcreteVideoInputMode, updater: (draft: VideoModeDraft) => VideoModeDraft) => {
      const current = videoDraftsRef.current;
      const next = { ...current, [mode]: normalizeVideoDraft(mode, updater(current[mode])) };
      videoDraftsRef.current = next;
      setVideoDrafts(next);
    },
    [],
  );

  const updateActiveVideoDraft = useCallback(
    (updater: (draft: VideoModeDraft) => VideoModeDraft) => {
      updateVideoDraft(selectedVideoMode, updater);
    },
    [selectedVideoMode, updateVideoDraft],
  );

  const setActiveVideoPrompt = useCallback(
    (value: string) => {
      updateActiveVideoDraft((draft) => ({ ...draft, prompt: value }));
    },
    [updateActiveVideoDraft],
  );

  const setActiveVideoReferenceUrlInput = useCallback(
    (value: string) => {
      updateActiveVideoDraft((draft) => ({ ...draft, referenceUrlInput: value }));
    },
    [updateActiveVideoDraft],
  );

  const modelsForMode = useMemo(() => {
    const categoryModels = models.filter((m) => m.category === "IMAGE2VIDEO");
    return categoryModels.filter(
      (m) => !m.videoInputMode || normalizeVideoMode(m.videoInputMode) === selectedVideoMode,
    );
  }, [models, selectedVideoMode]);

  const currentModel =
    modelsForMode.find((m) => m.code === activeVideoSettings.model) ??
    modelsForMode.find((m) => m.isDefault) ??
    modelsForMode[0] ??
    null;
  const currentModelLabel =
    currentModel ? modelDisplayName(currentModel, locale) : t("studio.noActiveModels");
  const currentModelLocked = false; // Video models use different access control
  const enabledVideoModes = VIDEO_INPUT_MODES;
  const hasActiveVideoReference =
    selectedVideoMode === "R2V" &&
    activeVideoRefs.some((ref) => (ref.kind ?? mediaKindFromUrl(ref.src)) === "video");
  const durationMinSeconds = hasActiveVideoReference
    ? VIDEO_REFERENCE_VIDEO_GENERATION_MIN_SECONDS
    : VIDEO_DURATION_MIN_SECONDS;
  const durationMaxSeconds = hasActiveVideoReference
    ? VIDEO_REFERENCE_VIDEO_GENERATION_MAX_SECONDS
    : VIDEO_DURATION_MAX_SECONDS;

  const referenceBounds = referenceBoundsForModel("video", currentModel);
  const videoReferenceLimit =
    selectedVideoMode === "T2V" ? 0 : selectedVideoMode === "I2V" ? 1 : MAX_STUDIO_REFERENCE_MEDIA;
  const videoDropzoneAccept =
    selectedVideoMode === "I2V"
      ? "image/jpeg,image/jpg,image/png,image/bmp,image/webp"
      : selectedVideoMode === "R2V" || selectedVideoMode === "EDIT"
        ? "image/jpeg,image/jpg,image/png,image/bmp,image/webp,video/mp4,video/quicktime,.mov"
        : "image/jpeg,image/jpg,image/png,image/bmp,image/webp";

  // ── Shared session hook ─────────────────────────────────────────
  const sharedParams: UseStudioSessionParams = useMemo(
    () => ({
      userId,
      sessionId,
      newSession: newSessionFromSearch,
      onboardingDemo,
      autoSubmit,
      focusJobId,
      routeMode: "video" as StudioMode,
      templateId,
      handoffId,
      sourceImage,
      sourceImageName,
      searchVideoInputMode,
      searchPrompt,
      models,
      modelsLoading,
      videoGenerationEnabled,
      hasAdvancedAccess,
      embedded,
      onResultAction,
    }),
    [
      userId,
      sessionId,
      newSessionFromSearch,
      onboardingDemo,
      autoSubmit,
      focusJobId,
      templateId,
      handoffId,
      sourceImage,
      sourceImageName,
      searchVideoInputMode,
      searchPrompt,
      models,
      modelsLoading,
      videoGenerationEnabled,
      hasAdvancedAccess,
      embedded,
      onResultAction,
    ],
  );

  const {
    activeSessionId,
    sessionTitle,
    sessionLoading,
    results,
    selectedJobId,
    submitting,
    studioJobs,
    studioJobsRefreshing,
    refreshStudioJobs,
    selected,
    selectedJobStatusPreview,
    previewJob: previewJobFromHook,
    startNewSession: startNewSessionFromHook,
    refreshStudioQueries,
    handleVideoGenerate,
    resolveResultTarget,
    appendMergedVideoToSession,
  } = useStudioSession(sharedParams);

  // ── Refs sync ───────────────────────────────────────────────────
  useEffect(() => {
    videoDraftsRef.current = videoDrafts;
  }, [videoDrafts]);

  // ── Video settings sync ─────────────────────────────────────────
  useEffect(() => {
    const nextMode = selectedVideoMode;
    const draft = videoDraftsRef.current[nextMode];
    const draftSettings = draft.settings;
    const currentModelMatches =
      Boolean(draftSettings.model) && modelsForMode.some((m) => m.code === draftSettings.model);
    const nextModel = currentModelMatches
      ? draftSettings.model
      : (modelsForMode.find((m) => m.isDefault)?.code ?? modelsForMode[0]?.code ?? "");
    const nextDraftSettings = defaultVideoSettingsForMode(nextMode, {
      ...draftSettings,
      model: nextModel,
    });
    if (
      draftSettings.videoInputMode !== nextMode ||
      draftSettings.model !== nextModel ||
      draftSettings.style !== "none"
    ) {
      updateVideoDraft(nextMode, (current) => ({ ...current, settings: nextDraftSettings }));
    }
    if (
      settings.videoInputMode === nextMode &&
      settings.model === nextModel &&
      settings.style === "none" &&
      settings.ratio === nextDraftSettings.ratio &&
      settings.resolution === nextDraftSettings.resolution &&
      settings.duration === nextDraftSettings.duration
    )
      return;
    setSettings({
      ...nextDraftSettings,
      videoInputMode: nextMode,
      model: nextModel,
      style: "none",
    });
  }, [modelsForMode, selectedVideoMode, setSettings, settings, updateVideoDraft]);

  useEffect(() => {
    const draft = videoDraftsRef.current[selectedVideoMode];
    const typedRefs = withVideoReferenceTypes(draft.refs, selectedVideoMode);
    if (
      typedRefs.every(
        (ref, index) =>
          ref.kind === draft.refs[index]?.kind && ref.mediaType === draft.refs[index]?.mediaType,
      )
    )
      return;
    updateVideoDraft(selectedVideoMode, (current) => ({ ...current, refs: typedRefs }));
  }, [selectedVideoMode, updateVideoDraft]);

  useEffect(() => {
    if (!hasActiveVideoReference) return;
    if (
      activeVideoSettings.duration >= VIDEO_REFERENCE_VIDEO_GENERATION_MIN_SECONDS &&
      activeVideoSettings.duration <= VIDEO_REFERENCE_VIDEO_GENERATION_MAX_SECONDS
    ) {
      return;
    }
    const nextDuration = Math.min(
      VIDEO_REFERENCE_VIDEO_GENERATION_MAX_SECONDS,
      Math.max(VIDEO_REFERENCE_VIDEO_GENERATION_MIN_SECONDS, activeVideoSettings.duration),
    );
    updateVideoDraft(selectedVideoMode, (draft) => ({
      ...draft,
      settings: { ...draft.settings, duration: nextDuration },
    }));
    if (settings.videoInputMode === selectedVideoMode) {
      setSettings({ ...settings, duration: nextDuration });
    }
  }, [
    activeVideoSettings.duration,
    hasActiveVideoReference,
    selectedVideoMode,
    setSettings,
    settings,
    updateVideoDraft,
  ]);

  // ── Reference helpers ───────────────────────────────────────────
  const clearReferenceDraft = () => {
    if (referenceFileInputRef.current) referenceFileInputRef.current.value = "";
    setReferenceDialogOpen(false);
    clearAllVideoDrafts();
  };

  const clearAllVideoDrafts = (promptText = "") => {
    const current = videoDraftsRef.current;
    const next = { ...current };
    for (const mode of VIDEO_INPUT_MODES) {
      next[mode] = normalizeVideoDraft(mode, {
        ...current[mode],
        prompt: mode === selectedVideoMode ? promptText : "",
        refs: [],
        referenceUrlInput: "",
      });
    }
    videoDraftsRef.current = next;
    setVideoDrafts(next);
  };

  const resetVideoGenerationPanel = () => {
    const defaultMode = normalizeVideoMode(
      defaultVideoModeForModels(allVideoModels),
    ) as ConcreteVideoInputMode;
    const nextDrafts = {} as VideoModeDrafts;
    for (const mode of VIDEO_INPUT_MODES) {
      const modeModels = allVideoModels.filter(
        (m) => !m.videoInputMode || normalizeVideoMode(m.videoInputMode) === mode,
      );
      const defaultModel = modeModels.find((m) => m.isDefault)?.code ?? modeModels[0]?.code ?? "";
      nextDrafts[mode] = {
        prompt: "",
        refs: [],
        settings: defaultVideoSettingsForMode(mode, { model: defaultModel }),
        referenceUrlInput: "",
      };
    }
    videoDraftsRef.current = nextDrafts;
    setVideoDrafts(nextDrafts);
    setSettings(nextDrafts[defaultMode].settings);
    if (referenceFileInputRef.current) referenceFileInputRef.current.value = "";
  };

  const addImageReferences = (
    refs: Array<{
      src: string;
      name: string;
      kind?: StudioReferenceKind;
      mediaType?: StudioVideoMediaType;
    }>,
    options: { replace?: boolean; closeDialog?: boolean; videoMode?: ConcreteVideoInputMode } = {},
  ) => {
    const targetVideoMode = options.videoMode ?? selectedVideoMode;
    const currentDraft = videoDraftsRef.current[targetVideoMode];
    const base = options.replace ? [] : currentDraft.refs;
    const seen = new Set(base.map((r) => r.src));
    const next = [...base];
    let added = 0;
    const maxRefs =
      targetVideoMode === "T2V" ? 0 : targetVideoMode === "I2V" ? 1 : MAX_STUDIO_REFERENCE_MEDIA;
    for (const ref of refs) {
      if (!ref.src || seen.has(ref.src)) continue;
      if (next.length >= maxRefs) break;
      const kind = ref.kind ?? mediaKindFromUrl(ref.src);
      if (targetVideoMode === "T2V" || (targetVideoMode === "I2V" && kind !== "image")) continue;
      seen.add(ref.src);
      next.push({
        id: newStudioId(),
        src: ref.src,
        name: ref.name,
        kind,
        mediaType: ref.mediaType ?? referenceMediaTypeFor(targetVideoMode, kind, next.length),
      });
      added += 1;
    }
    if (added > 0) {
      updateVideoDraft(targetVideoMode, (draft) => ({
        ...draft,
        refs: withVideoReferenceTypes(next, targetVideoMode),
        referenceUrlInput: "",
      }));
      if (
        targetVideoMode === "R2V" &&
        refs.some((ref) => (ref.kind ?? mediaKindFromUrl(ref.src)) === "video")
      ) {
        toast.info(t("studio.videoReferenceVideoDurationRule"));
      }
      if (options.closeDialog) setReferenceDialogOpen(false);
    }
    return added;
  };

  const removeImageReference = (id: string) => {
    updateVideoDraft(selectedVideoMode, (draft) => ({
      ...draft,
      refs: draft.refs.filter((r) => r.id !== id),
    }));
  };

  const addReferenceUrl = (value = videoDraftsRef.current[selectedVideoMode].referenceUrlInput) => {
    const src = normalizeReferenceInput(value);
    if (!value.trim()) return false;
    if (!src) {
      toast.error(t("studio.invalidReferenceUrl"));
      return false;
    }
    const kind = mediaKindFromUrl(src);
    const added = addImageReferences([{ src, name: t("studio.reference"), kind }]);
    return added > 0 || videoDraftsRef.current[selectedVideoMode].refs.some((r) => r.src === src);
  };

  const addReferenceFiles = async (files: FileList | File[] | null | undefined) => {
    const selectedFiles = Array.from(files ?? []);
    if (!selectedFiles.length) return;
    const acceptedFiles = selectedFiles.filter((file) => {
      const kind = referenceKindFromFile(file);
      const ext = extensionFromName(file.name);
      if (!kind) return false;
      if (kind === "image")
        return (
          STUDIO_REFERENCE_IMAGE_EXTENSIONS.includes(ext) ||
          STUDIO_REFERENCE_IMAGE_EXTENSIONS.some((v) => file.type.toLowerCase().includes(v))
        );
      return (
        STUDIO_REFERENCE_VIDEO_EXTENSIONS.includes(ext) ||
        file.type === "video/mp4" ||
        file.type === "video/quicktime"
      );
    });
    if (!acceptedFiles.length) {
      toast.error(t("studio.invalidReferenceFile"));
      return;
    }
    const maxRefs =
      selectedVideoMode === "T2V"
        ? 0
        : selectedVideoMode === "I2V"
          ? 1
          : MAX_STUDIO_REFERENCE_MEDIA;
    const currentRefs = videoDraftsRef.current[selectedVideoMode].refs;
    const remaining = maxRefs - currentRefs.length;
    if (remaining <= 0) {
      toast.error(t("studio.videoReferenceLimit", { count: maxRefs }));
      return;
    }
    const modeFilteredFiles = acceptedFiles.filter((file) => {
      const kind = referenceKindFromFile(file);
      if (selectedVideoMode === "I2V") return kind === "image";
      if (selectedVideoMode === "T2V") return false;
      return kind === "image" || kind === "video";
    });
    if (!modeFilteredFiles.length) {
      toast.error(t("studio.invalidReferenceFile"));
      return;
    }
    const filesToUpload = modeFilteredFiles.slice(0, remaining);
    setReferenceUploading(true);
    try {
      const refs = await Promise.all(
        filesToUpload.map(async (file) => {
          const kind = referenceKindFromFile(file) ?? "image";
          if (kind === "image" && file.size > STUDIO_REFERENCE_IMAGE_MAX_BYTES)
            throw new Error(t("studio.referenceImageTooLarge"));
          if (kind === "image") {
            const dimensions = await readImageDimensions(file);
            if (
              dimensions.width < STUDIO_VIDEO_REFERENCE_IMAGE_MIN_DIMENSION ||
              dimensions.height < STUDIO_VIDEO_REFERENCE_IMAGE_MIN_DIMENSION
            ) {
              throw new Error(
                t("studio.videoReferenceImageResolutionTooSmall", {
                  min: STUDIO_VIDEO_REFERENCE_IMAGE_MIN_DIMENSION,
                  width: dimensions.width,
                  height: dimensions.height,
                }),
              );
            }
          }
          if (kind === "video" && file.size > STUDIO_REFERENCE_VIDEO_MAX_BYTES)
            throw new Error(t("studio.referenceVideoTooLarge"));
          return {
            src: await referenceSrcFromBlob(file, file.name || t("studio.reference"), kind),
            name: file.name || t("studio.reference"),
            kind,
          };
        }),
      );
      addImageReferences(refs, { videoMode: selectedVideoMode });
    } catch (err) {
      toast.error(t("studio.referenceFileReadFailed"), {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setReferenceUploading(false);
    }
  };

  // ── Actions ─────────────────────────────────────────────────────
  const updateActiveVideoSettings = (patch: Partial<StudioSettings>) => {
    const targetMode = normalizeVideoMode(
      patch.videoInputMode ?? selectedVideoMode,
    ) as ConcreteVideoInputMode;
    const targetDraft = videoDraftsRef.current[targetMode];
    const targetHasVideoReference =
      targetMode === "R2V" &&
      targetDraft.refs.some((ref) => (ref.kind ?? mediaKindFromUrl(ref.src)) === "video");
    const nextDurationMax = targetHasVideoReference
      ? VIDEO_REFERENCE_VIDEO_GENERATION_MAX_SECONDS
      : VIDEO_DURATION_MAX_SECONDS;
    const nextDurationMin = targetHasVideoReference
      ? VIDEO_REFERENCE_VIDEO_GENERATION_MIN_SECONDS
      : VIDEO_DURATION_MIN_SECONDS;
    const nextSettings = defaultVideoSettingsForMode(targetMode, {
      ...targetDraft.settings,
      ...patch,
      duration: Math.min(
        nextDurationMax,
        Math.max(
          nextDurationMin,
          clampStudioVideoDuration(patch.duration ?? targetDraft.settings.duration),
        ),
      ),
      mode: "video",
      videoInputMode: targetMode,
    });
    setSettings(nextSettings);
    updateVideoDraft(targetMode, (draft) => ({ ...draft, settings: nextSettings }));
  };

  const download = async (item: StudioResult) => {
    try {
      const blob = await fetchMediaBlob(item);
      saveBlob(blob, `megick-${item.kind}-${item.id}.${mediaExtension(blob, item)}`);
    } catch (err) {
      toast.error(t("studio.downloadFailed"), {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const openVideoEditor = async (result: StudioResult) => {
    const target = await resolveResultTarget(result);
    if (!target || target.result.kind !== "video") {
      toast.error(t("studio.openConversationFailed"));
      return;
    }
    if (embedded && onResultAction) {
      void onResultAction({
        sessionId: target.sessionId,
        sessionTitle: target.sessionTitle,
        messageId: target.msgId,
        result: target.result,
      });
      return;
    }
    if (embedded) return;
    navigate({
      to: "/dashboard/video-editor",
      search: {
        sourceSessionId: target.sessionId,
        sourceMessageId: target.msgId,
        sourceResultId: target.result.id,
      },
    });
  };

  const addAsReference = async (result: StudioResult) => {
    if (result.kind !== "image") {
      toast.error(t("studio.selectImageForVideo"));
      return;
    }
    try {
      const src = await referenceSrcFromResult(result);
      const added = addImageReferences([{ src, name: t("studio.reference"), kind: "image" }]);
      if (added > 0) toast.success(t("studio.refAdded"));
    } catch (err) {
      toast.error(t("studio.referenceFileReadFailed"), {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  // ── Generate ────────────────────────────────────────────────────
  const onClearVideoInputs = useCallback(() => {
    updateVideoDraft(selectedVideoMode, (draft) => ({
      ...draft,
      prompt: "",
      refs: [],
      referenceUrlInput: "",
    }));
  }, [selectedVideoMode, updateVideoDraft]);

  const onGenerate = useCallback(async () => {
    await handleVideoGenerate({
      selectedVideoMode,
      videoDraftsRef,
      updateVideoDraft,
      settings,
      onClearInputs: onClearVideoInputs,
    });
  }, [handleVideoGenerate, selectedVideoMode, updateVideoDraft, settings, onClearVideoInputs]);

  const retryGenerationJob = useCallback(
    (job: GenerationJobPublic) => {
      const jobMode: StudioMode = job.type === "IMAGE2VIDEO" ? "video" : "image";
      const videoMode = normalizeVideoMode(
        job.params?.videoInputMode ?? "T2V",
      ) as ConcreteVideoInputMode;
      const patch = settingsPatchFromGenerationJob(job, jobMode);
      const refs = refsFromGenerationJobParams(job, jobMode, handoffReferenceName(jobMode, t));

      updateVideoDraft(videoMode, (draft) => ({
        ...draft,
        prompt: job.prompt,
        refs,
        settings: defaultVideoSettingsForMode(videoMode, patch),
        referenceUrlInput: "",
      }));
      setSettings(defaultVideoSettingsForMode(videoMode, patch));
      toast.success(t("studio.promptReused"));
    },
    [setSettings, t, updateVideoDraft],
  );

  const onReset = () => {
    resetVideoGenerationPanel();
    startNewSessionFromHook();
  };

  const openMediaCenter = () => {
    const sessionVideos = results.filter((item) => item.kind === "video");
    if (sessionVideos.length === 0) {
      toast.error(t("studio.mediaCenter.empty"));
      return;
    }
    setMediaCenterOpen(true);
  };
  const sessionVideos = results.filter((item) => item.kind === "video");

  // ── Handoff/sourceImage effect ──────────────────────────────────
  const searchPromptRef = useRef<string | undefined>(searchPrompt);
  useEffect(() => {
    searchPromptRef.current = searchPrompt;
  }, [searchPrompt]);

  useEffect(() => {
    const handoff = handoffId
      ? (() => {
          const raw =
            typeof window !== "undefined"
              ? window.sessionStorage.getItem(`megick-handoff:${handoffId}`)
              : null;
          return raw ? JSON.parse(raw) : null;
        })()
      : null;
    const direct = sourceImage?.trim()
      ? { src: sourceImage, name: sourceImageName, prompt: undefined }
      : null;
    const incomingRefs = handoff?.refs?.length
      ? handoff.refs.map((r: { src: string; name?: string }) => ({
          id: newStudioId(),
          src: r.src,
          name: r.name || handoffReferenceName("video", t),
        }))
      : handoff?.src
        ? [
            {
              id: newStudioId(),
              src: handoff.src,
              name: handoff.name || handoffReferenceName("video", t),
            },
          ]
        : direct?.src
          ? [
              {
                id: newStudioId(),
                src: direct.src,
                name: direct.name || handoffReferenceName("video", t),
              },
            ]
          : [];
    if (!incomingRefs.length) return;
    const key = `${handoffId ?? "direct"}:${incomingRefs.map((i: { src: string }) => i.src).join("|")}`;
    if (handoffAppliedRef.current === key) return;
    handoffAppliedRef.current = key;

    const requestedIncomingMode = normalizeVideoMode(
      handoff?.videoInputMode ?? searchVideoInputMode,
    );
    const inferredIncomingMode = incomingRefs.some(
      (ref: { src: string }) => mediaKindFromUrl(ref.src) === "video",
    )
      ? "EDIT"
      : incomingRefs.length > 1
        ? "R2V"
        : "I2V";
    const incomingMode =
      requestedIncomingMode === "I2V" || requestedIncomingMode === "R2V"
        ? requestedIncomingMode
        : inferredIncomingMode;
    const typedRefs = withVideoReferenceTypes(
      incomingRefs.map((ref: { id: string; src: string; name: string }) => ({
        ...ref,
        kind: mediaKindFromUrl(ref.src),
      })),
      incomingMode,
    );
    updateVideoDraft(incomingMode, (draft) => ({
      ...draft,
      prompt: draft.prompt.trim()
        ? draft.prompt
        : (handoff?.prompt ?? direct?.prompt ?? searchPromptRef.current?.trim() ?? ""),
      refs: typedRefs,
    }));
    setSettings({
      ...videoDraftsRef.current[incomingMode].settings,
      mode: "video",
      style: "none",
      videoInputMode: incomingMode,
    });
  }, [
    handoffId,
    searchVideoInputMode,
    searchPrompt,
    setSettings,
    sourceImage,
    sourceImageName,
    t,
    updateVideoDraft,
  ]);

  // ── Source image for I2V/R2V ────────────────────────────────────
  useEffect(() => {
    const src = sourceImage?.trim();
    if (!src) return;
    const incomingMode = normalizeVideoMode(searchVideoInputMode);
    if (incomingMode !== "I2V" && incomingMode !== "R2V") return;
    const currentDraft = videoDraftsRef.current[incomingMode];
    if (currentDraft.refs.some((r) => r.src === src)) return;
    const kind = mediaKindFromUrl(src);
    if (kind !== "image") return;
    updateVideoDraft(incomingMode, (draft) => ({
      ...draft,
      prompt: draft.prompt.trim() ? draft.prompt : (searchPromptRef.current?.trim() ?? ""),
      refs: withVideoReferenceTypes(
        [
          {
            id: newStudioId(),
            src,
            name: sourceImageName || handoffReferenceName("video", t),
            kind,
          },
        ],
        incomingMode,
      ),
    }));
    setSettings({
      ...videoDraftsRef.current[incomingMode].settings,
      mode: "video",
      style: "none",
      videoInputMode: incomingMode,
    });
  }, [searchVideoInputMode, setSettings, sourceImage, sourceImageName, t, updateVideoDraft]);

  return (
    <div
      className={cn(
        "overflow-hidden",
        stackedLayout ? "min-h-[calc(100dvh-5rem)]" : "h-full min-h-0",
        !embedded && !stackedLayout && "xl:h-[calc(100dvh-6rem)]",
      )}
    >
      <ResizablePanelGroup
        direction={stackedLayout ? "vertical" : "horizontal"}
        className={cn("gap-3 sm:gap-4", stackedLayout ? "min-h-[1500px]" : "min-h-0")}
      >
        <ResizablePanel
          defaultSize={stackedLayout ? 55 : 38}
          minSize={stackedLayout ? 45 : 28}
          maxSize={stackedLayout ? 75 : 58}
          className={cn("min-h-0", !stackedLayout && "min-w-[320px]")}
        >
          <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
            <VideoGenerationPanel
              prompt={activeVideoPrompt}
              setPrompt={setActiveVideoPrompt}
              settings={activeVideoSettings}
              updateSettings={updateActiveVideoSettings}
              selectedVideoMode={selectedVideoMode}
              enabledVideoModes={enabledVideoModes}
              modelLabelForCredits={(model) => modelCreditLabel(model, t, formatNumber)}
              currentModel={currentModel}
              currentModelLabel={currentModelLabel}
              currentModelLocked={currentModelLocked}
              modelsForMode={modelsForMode}
              modelsLoading={modelsLoading}
              hasAdvancedAccess={hasAdvancedAccess}
              studioRefs={activeVideoRefs}
              addReferenceFiles={addReferenceFiles}
              removeImageReference={removeImageReference}
              referenceFileInputRef={referenceFileInputRef}
              referenceUploading={referenceUploading}
              referenceUrlInput={activeVideoReferenceUrlInput}
              setReferenceUrlInput={setActiveVideoReferenceUrlInput}
              addReferenceUrl={addReferenceUrl}
              videoReferenceLimit={videoReferenceLimit}
              videoDropzoneAccept={videoDropzoneAccept}
              durationMinSeconds={durationMinSeconds}
              durationMaxSeconds={durationMaxSeconds}
              promptTipsOpen={promptTipsOpen}
              setPromptTipsOpen={setPromptTipsOpen}
              submitting={submitting}
              handleGenerate={onGenerate}
              onReset={onReset}
              startNewSession={startNewSessionFromHook}
              openMediaCenter={openMediaCenter}
              formatNumber={formatNumber}
            />
          </section>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right panel: Preview + Job history */}
        <ResizablePanel
          defaultSize={stackedLayout ? 45 : 62}
          minSize={stackedLayout ? 25 : 32}
          className={cn("min-h-0", !stackedLayout && "min-w-[280px]")}
        >
          <section className="flex h-full min-h-0 min-w-0 flex-col rounded-lg border border-border bg-card">
            <div className="flex min-h-0 flex-1 overflow-y-auto">
              {sessionLoading ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                </div>
              ) : selectedJobStatusPreview ? (
                <FailedJobPreview
                  job={selectedJobStatusPreview}
                  mode="video"
                  onRetry={() => retryGenerationJob(selectedJobStatusPreview)}
                />
              ) : selected ? (
                selected.kind === "video" ? (
                  <VideoPreviewPanel
                    result={selected}
                    onZoom={() => setZoomOpen(true)}
                    onDownload={() => download(selected)}
                    onEdit={() => {
                      void openVideoEditor(selected);
                    }}
                    onOpenMergeVideos={openMediaCenter}
                    resultActionLabel={resultActionLabel}
                    onResultAction={
                      onResultAction && activeSessionId
                        ? () =>
                            void resolveResultTarget(selected).then((target) => {
                              if (!target) {
                                toast.error(t("studio.openConversationFailed"));
                                return;
                              }
                              void onResultAction({
                                sessionId: target.sessionId,
                                sessionTitle: target.sessionTitle,
                                messageId: target.msgId,
                                result: target.result,
                              });
                            })
                        : undefined
                    }
                  />
                ) : (
                  <ImagePreviewPanel
                    result={selected}
                    onZoom={() => setZoomOpen(true)}
                    onDownload={() => download(selected)}
                    onDownloadPsd={() => download(selected)}
                    onEdit={() => {
                      void addAsReference(selected);
                    }}
                    onGenerateVideo={() => undefined}
                    videoGenerationEnabled={false}
                    resultActionLabel={resultActionLabel}
                    onResultAction={
                      onResultAction && activeSessionId
                        ? () =>
                            void resolveResultTarget(selected).then((target) => {
                              if (!target) {
                                toast.error(t("studio.openConversationFailed"));
                                return;
                              }
                              void onResultAction({
                                sessionId: target.sessionId,
                                sessionTitle: target.sessionTitle,
                                messageId: target.msgId,
                                result: target.result,
                              });
                            })
                        : undefined
                    }
                  />
                )
              ) : (
                <EmptyPreview mode="video" />
              )}
            </div>
            <StudioJobHistoryStrip
              jobs={studioJobs}
              loading={sessionLoading}
              refreshing={studioJobsRefreshing}
              activeJobId={selectedJobId ?? selected?.jobId ?? focusJobId}
              mode="video"
              onRefresh={refreshStudioJobs}
              onPreviewJob={previewJobFromHook}
              onRetry={retryGenerationJob}
            />
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Dialogs */}
      <ReferenceUploadDialog
        open={referenceDialogOpen}
        onOpenChange={setReferenceDialogOpen}
        title={t("studio.videoPanel.addMedia")}
        refs={activeVideoRefs}
        referenceFileInputRef={referenceFileInputRef}
        referenceUploading={referenceUploading}
        referenceUrlInput={activeVideoReferenceUrlInput}
        setReferenceUrlInput={setActiveVideoReferenceUrlInput}
        addReferenceFiles={addReferenceFiles}
        addReferenceUrl={addReferenceUrl}
        removeReference={removeImageReference}
        referenceLimit={videoReferenceLimit}
        labels={{
          dropzone:
            selectedVideoMode === "I2V"
              ? t("studio.videoPanel.dropImage")
              : t("studio.videoPanel.dropMedia"),
          limit:
            selectedVideoMode === "I2V"
              ? t("studio.referenceLimit", { count: 1 })
              : t("studio.referenceLimit", { count: videoReferenceLimit }),
          placeholder: t("studio.referenceImageUrlPlaceholder"),
          cancel: t("common.cancel"),
          confirm: t("common.confirm"),
          remove: t("studio.remove"),
        }}
      />
      <TemplateCenterDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        title={t("studio.templateCenter")}
        search={templateSearch}
        onTemplateSelect={(_template: PromptTemplatePublic) => setTemplateOpen(false)}
        onSearchChange={setTemplateSearch}
        initialVideoGenerationEnabled={videoGenerationEnabled}
      />
      <MediaCenterDialog
        open={mediaCenterOpen}
        onOpenChange={setMediaCenterOpen}
        title={t("studio.mediaCenter")}
        description={t("studio.mediaCenter.description")}
        videos={sessionVideos}
        fetchMediaBlob={fetchMediaBlob}
        objectUrlFromBlob={objectUrlFromBlob}
        appendMergedVideoToSession={appendMergedVideoToSession}
      />
      <ZoomPreviewDialog
        open={zoomOpen}
        onOpenChange={setZoomOpen}
        result={selected}
        title={t("studio.viewLargeImage")}
        imageAlt={t("studio.generatedPreviewAlt")}
      />
    </div>
  );
}
