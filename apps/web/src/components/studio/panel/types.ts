import type { VideoModelInputMode } from "@megick/api-types";
import type { StudioMode, StudioResult, StudioSettings } from "@/routes/-dashboard-types";

export type StudioReference = { id: string; src: string; name: string; mediaId?: string };
export type StudioReferenceKind = "image" | "video";
export type StudioVideoMediaType =
  | "first_frame"
  | "last_frame"
  | "first_clip"
  | "reference_image"
  | "reference_video"
  | "video";
export type StudioMediaReference = StudioReference & {
  kind?: StudioReferenceKind;
  mediaType?: StudioVideoMediaType;
};

export type StudioGenerationPayload = {
  promptText?: string;
  mode?: StudioMode;
  refs?: StudioMediaReference[];
  settingsPatch?: Partial<StudioSettings>;
};

export type ConcreteVideoInputMode = Exclude<VideoModelInputMode, null>;

export type VideoModeDraft = {
  prompt: string;
  refs: StudioMediaReference[];
  settings: StudioSettings;
  referenceUrlInput: string;
};

export type VideoModeDrafts = Record<ConcreteVideoInputMode, VideoModeDraft>;

export type StudioEditTarget = {
  sessionId: string;
  sessionTitle: string;
  msgId: string;
  result: StudioResult;
};

export type StudioResultActionPayload = {
  sessionId: string;
  sessionTitle: string;
  messageId: string;
  result: StudioResult;
};

export type StudioResultAction = (payload: StudioResultActionPayload) => void | Promise<void>;

export type StudioHandoff = {
  src?: string;
  name?: string;
  refs?: Array<{ src: string; name?: string }>;
  prompt?: string;
  videoInputMode?: ConcreteVideoInputMode;
};
