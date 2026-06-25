import type { TranslationKey } from "@/lib/i18n";

export type OnboardingTourTarget =
  | "dashboard-shell"
  | "nav-image-studio"
  | "nav-video-studio"
  | "nav-history"
  | "image-style-selector"
  | "image-reference-upload"
  | "studio-generate-button"
  | "image-result-actions"
  | "image-use-as-reference"
  | "image-ai-edit"
  | "image-results-fallback"
  | "video-model-selector"
  | "video-prompt-input"
  | "video-duration-selector"
  | "video-generate-button"
  | "generation-history-panel"
  | "generation-history-filters";

export type OnboardingTourRoute =
  | "/dashboard/studio/image"
  | "/dashboard/studio/video"
  | "/dashboard/history";

export type OnboardingTourStep = {
  id: string;
  route?: OnboardingTourRoute;
  search?: Record<string, unknown>;
  target: OnboardingTourTarget;
  fallbackTarget?: OnboardingTourTarget;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  nextLabelKey?: TranslationKey;
  side?: "top" | "right" | "bottom" | "left" | "over";
  align?: "start" | "center" | "end";
  openSidebar?: boolean;
  requiresVideoGeneration?: boolean;
  waitTimeoutMs?: number;
};

export const ONBOARDING_TOUR_SELECTOR = "data-onboarding-target";

export function onboardingTourSelector(target: OnboardingTourTarget) {
  return `[${ONBOARDING_TOUR_SELECTOR}="${target}"]`;
}

export const onboardingTourSteps: OnboardingTourStep[] = [
  {
    id: "intro",
    target: "dashboard-shell",
    titleKey: "onboardingTour.intro.title",
    descriptionKey: "onboardingTour.intro.description",
    nextLabelKey: "onboardingTour.start",
    side: "over",
    align: "center",
  },
  {
    id: "image-nav",
    target: "nav-image-studio",
    titleKey: "onboardingTour.imageNav.title",
    descriptionKey: "onboardingTour.imageNav.description",
    side: "right",
    align: "center",
    openSidebar: true,
  },
  {
    id: "image-style",
    route: "/dashboard/studio/image",
    target: "image-style-selector",
    titleKey: "onboardingTour.imageStyle.title",
    descriptionKey: "onboardingTour.imageStyle.description",
    side: "top",
    align: "start",
  },
  {
    id: "image-reference",
    route: "/dashboard/studio/image",
    target: "image-reference-upload",
    titleKey: "onboardingTour.imageReference.title",
    descriptionKey: "onboardingTour.imageReference.description",
    side: "top",
    align: "center",
  },
  {
    id: "image-generate",
    route: "/dashboard/studio/image",
    target: "studio-generate-button",
    titleKey: "onboardingTour.imageGenerate.title",
    descriptionKey: "onboardingTour.imageGenerate.description",
    side: "top",
    align: "end",
  },
  {
    id: "image-result-actions",
    route: "/dashboard/studio/image",
    target: "image-result-actions",
    fallbackTarget: "image-results-fallback",
    titleKey: "onboardingTour.imageResultActions.title",
    descriptionKey: "onboardingTour.imageResultActions.description",
    side: "left",
    align: "start",
    waitTimeoutMs: 800,
  },
  {
    id: "image-use-as-reference",
    route: "/dashboard/studio/image",
    target: "image-use-as-reference",
    fallbackTarget: "image-results-fallback",
    titleKey: "onboardingTour.imageUseAsReference.title",
    descriptionKey: "onboardingTour.imageUseAsReference.description",
    side: "left",
    align: "center",
    waitTimeoutMs: 800,
  },
  {
    id: "image-ai-edit",
    route: "/dashboard/studio/image",
    target: "image-ai-edit",
    fallbackTarget: "image-results-fallback",
    titleKey: "onboardingTour.imageAiEdit.title",
    descriptionKey: "onboardingTour.imageAiEdit.description",
    side: "left",
    align: "center",
    waitTimeoutMs: 800,
  },
  {
    id: "video-nav",
    target: "nav-video-studio",
    fallbackTarget: "dashboard-shell",
    titleKey: "onboardingTour.videoNav.title",
    descriptionKey: "onboardingTour.videoNav.description",
    side: "right",
    align: "center",
    openSidebar: true,
    requiresVideoGeneration: true,
    waitTimeoutMs: 800,
  },
  {
    id: "video-model",
    route: "/dashboard/studio/video",
    target: "video-model-selector",
    titleKey: "onboardingTour.videoModel.title",
    descriptionKey: "onboardingTour.videoModel.description",
    side: "bottom",
    align: "start",
    requiresVideoGeneration: true,
  },
  {
    id: "video-prompt",
    route: "/dashboard/studio/video",
    target: "video-prompt-input",
    titleKey: "onboardingTour.videoPrompt.title",
    descriptionKey: "onboardingTour.videoPrompt.description",
    side: "right",
    align: "center",
    requiresVideoGeneration: true,
  },
  {
    id: "video-duration",
    route: "/dashboard/studio/video",
    target: "video-duration-selector",
    titleKey: "onboardingTour.videoDuration.title",
    descriptionKey: "onboardingTour.videoDuration.description",
    side: "top",
    align: "center",
    requiresVideoGeneration: true,
  },
  {
    id: "video-generate",
    route: "/dashboard/studio/video",
    target: "video-generate-button",
    titleKey: "onboardingTour.videoGenerate.title",
    descriptionKey: "onboardingTour.videoGenerate.description",
    side: "top",
    align: "end",
    requiresVideoGeneration: true,
  },
  {
    id: "history-nav",
    target: "nav-history",
    titleKey: "onboardingTour.historyNav.title",
    descriptionKey: "onboardingTour.historyNav.description",
    side: "right",
    align: "center",
    openSidebar: true,
  },
  {
    id: "history-panel",
    route: "/dashboard/history",
    target: "generation-history-filters",
    fallbackTarget: "generation-history-panel",
    titleKey: "onboardingTour.historyPanel.title",
    descriptionKey: "onboardingTour.historyPanel.description",
    side: "bottom",
    align: "start",
  },
];
