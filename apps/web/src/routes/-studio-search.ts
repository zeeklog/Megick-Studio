import {
  asSearchRecord,
  optionalBooleanString,
  optionalEnum,
  optionalString,
} from "@/lib/search-params";

type BaseStudioSearch = {
  prompt?: string;
  style?: string;
  ratio?: string;
  sessionId?: string;
  jobId?: string;
  templateId?: string;
  handoffId?: string;
  newSession?: boolean | string;
  onboardingDemo?: boolean | string;
  autoSubmit?: boolean | string;
};

export type ImageStudioSearch = BaseStudioSearch & {
  sourceImage?: string;
  sourceImageName?: string;
};

export type StudioSearch = ImageStudioSearch & {
  videoInputMode?: "T2V" | "I2V" | "R2V" | "EDIT";
};

export type LegacyStudioSearch = StudioSearch & {
  mode?: "image" | "video";
};

const VIDEO_INPUT_MODES = ["T2V", "I2V", "R2V", "EDIT"] as const;
const STUDIO_MODES = ["image", "video"] as const;

function baseStudioSearch(input: unknown): BaseStudioSearch {
  const search = asSearchRecord(input);
  return {
    prompt: optionalString(search.prompt),
    style: optionalString(search.style),
    ratio: optionalString(search.ratio),
    sessionId: optionalString(search.sessionId),
    jobId: optionalString(search.jobId),
    templateId: optionalString(search.templateId),
    handoffId: optionalString(search.handoffId),
    newSession: optionalBooleanString(search.newSession),
    onboardingDemo: optionalBooleanString(search.onboardingDemo),
    autoSubmit: optionalBooleanString(search.autoSubmit),
  };
}

export function imageStudioSearchSchema(input: unknown): ImageStudioSearch {
  const search = asSearchRecord(input);
  return {
    ...baseStudioSearch(search),
    sourceImage: optionalString(search.sourceImage),
    sourceImageName: optionalString(search.sourceImageName),
  };
}

export function videoStudioSearchSchema(input: unknown): StudioSearch {
  const search = asSearchRecord(input);
  return {
    ...imageStudioSearchSchema(search),
    videoInputMode: optionalEnum(search.videoInputMode, VIDEO_INPUT_MODES),
  };
}

export const studioSearchSchema = videoStudioSearchSchema;

export function legacyStudioSearchSchema(input: unknown): LegacyStudioSearch {
  const search = asSearchRecord(input);
  return {
    ...studioSearchSchema(search),
    mode: optionalEnum(search.mode, STUDIO_MODES),
  };
}
