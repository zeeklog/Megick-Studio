/**
 * @megick/api-types
 * --------------------------------------------------------------
 * Hand-rolled DTO type aliases used by the web app. The full
 * OpenAPI schema can be re-emitted into `./generated/openapi.d.ts`
 * via `pnpm openapi:types` after the API is running.
 */

export type GenerationJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

export type GenerationJobType = "TEXT2IMAGE" | "IMAGE2VIDEO" | "IMAGE_EDIT";

export type AIModelCategory = "TEXT" | "TEXT2IMAGE" | "IMAGE2VIDEO";
export type VideoModelInputMode = "T2V" | "I2V" | "R2V" | "EDIT";
export type ImageModelInputMode = "T2I" | "I2I" | "EDIT";
export type ModelProviderApiStyle = "OPENAI" | "CREX" | "VOLCENGINE";

export type ShowcaseItemType = "TEXT2IMAGE" | "IMAGE2VIDEO";

export type PromptTemplateStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type OAuthProvider = "GOOGLE" | "GITHUB" | "APPLE";

export type UserRoleCode = "SUPER_ADMIN" | "USER";
export type DesktopPlatform = "MAC" | "WIN";
export type AppLocale = "zh-CN" | "zh-TW" | "en" | "ja" | "fr" | "de";

export interface CloudR2ConfigAdmin {
  id?: string;
  source: "DB" | "ENV" | "EMPTY";
  isActive: boolean;
  accountId: string;
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  hasSecretAccessKey: boolean;
  publicBaseUrl: string;
  publicDevelopmentUrl: string;
  keyPrefix: string;
  presignExpiresSeconds: number;
  publicDownloadAvailable: boolean;
  missingKeys: string[];
}

export type DesktopR2ConfigAdmin = CloudR2ConfigAdmin;

export interface CloudOssConfigAdmin {
  id?: string;
  source: "DB" | "ENV" | "EMPTY";
  isActive: boolean;
  region: string;
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
  hasAccessKeySecret: boolean;
  domain: string;
  publicBaseUrl: string;
  missingKeys: string[];
}

export interface DesktopReleaseAdmin {
  id: string;
  platform: DesktopPlatform;
  version: string;
  downloadUrl: string;
  r2ObjectKey?: string | null;
  fileName?: string | null;
  fileSizeBytes?: string | null;
  sha256?: string | null;
  sha512?: string | null;
  releaseNotes?: string | null;
  isLatest: boolean;
  forceUpdate: boolean;
  isActive: boolean;
  publishedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export type DesktopLatestReleaseResponse = {
  platform: DesktopPlatform;
  version: string;
  downloadUrl: string;
  sourceUrl?: string | null;
  fileName?: string | null;
  fileSizeBytes?: string | null;
  sha256?: string | null;
  releaseNotes?: string | null;
  forceUpdate: boolean;
  publishedAt?: string | null;
} | null;

export interface DesktopUpdateCheckResponse {
  updateAvailable: boolean;
  currentVersion: string;
  latest?: DesktopLatestReleaseResponse | null;
}

export interface PresignedDesktopUploadResponse {
  uploadUrl: string;
  objectKey: string;
  publicUrl: string;
  expiresAt: string;
}

export interface DesktopInstallerUploadResponse {
  objectKey: string;
  publicUrl: string;
  fileName: string;
  fileSizeBytes: number;
}

export interface MeResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl?: string;
    locale: AppLocale;
    localeSource: "device" | "explicit";
    localeUpdatedAt?: string | null;
    role: UserRoleCode;
    isSuperAdmin: boolean;
    credits: number;
    /** Admin-managed entitlement flag used for premium models and original asset access. */
    hasAdvancedAccess: boolean;
  } | null;
}

export interface AuthConfigResponse {
  passwordLoginEnabled: boolean;
  registrationEnabled: boolean;
  registrationEmailVerificationEnabled: boolean;
  registrationDisabledMessage: string;
  oauthProviders: Array<Lowercase<OAuthProvider>>;
  oauthProviderClientIds: Partial<Record<Lowercase<OAuthProvider>, string>>;
}

export interface AIModelPublic {
  id: string;
  code: string;
  displayName: string;
  displayNameEn?: string | null;
  category: AIModelCategory;
  accessLevel: "FREE" | "PAID";
  /** TEXT/TEXT2IMAGE: credits per job. IMAGE2VIDEO: credits per second. */
  costCredits: number;
  isDefault: boolean;
  isActive: boolean;
  textUsages?: string[];
  systemPrompt?: string;
  videoInputMode?: VideoModelInputMode | null;
  imageInputMode?: ImageModelInputMode | null;
  supportsReferenceImages?: boolean;
  requiresReferenceImages?: boolean;
  minReferenceImages?: number;
  maxReferenceImages?: number;
}

export interface AIModelAdmin extends AIModelPublic {
  providerId?: string | null;
  provider?: {
    id: string;
    code: string;
    name: string;
    baseUrl: string;
    isActive: boolean;
  } | null;
  baseUrl: string;
  modelName: string;
  defaultParams: Record<string, unknown>;
  rateLimitPerMinute?: number;
  sortOrder: number;
  description?: string | null;
  hasApiKey: boolean;
}

export interface ModelProviderPublic {
  id: string;
  code: string;
  name: string;
  baseUrl: string;
  apiStyle: ModelProviderApiStyle;
  statusUrl?: string | null;
  maxPollDurationMs: number;
  pollIntervalMs: number;
  maxPollAttempts: number;
  isActive: boolean;
  sortOrder: number;
}

export interface ModelProviderAdmin extends ModelProviderPublic {
  extra?: Record<string, unknown>;
  hasApiKey: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AIImageEditModeFieldPublic {
  name: string;
  label?: string;
  type?: "text" | "textarea" | "select" | "number";
  required?: boolean;
  placeholder?: string;
  options?: string[];
  defaultValue?: string | number | boolean;
}

export interface AIImageEditModeParams {
  apiStyle?: "bfl-fill" | "flux2-edit" | string;
  requestModelName?: string;
  promptRequired?: boolean;
  defaultPrompt?: string;
  maskRequired?: boolean;
  fields?: AIImageEditModeFieldPublic[];
  [key: string]: unknown;
}

export interface AIImageEditModePublic {
  id: string;
  code: string;
  name: string;
  modelName: string;
  requiresMask: boolean;
  defaultParams: AIImageEditModeParams;
  costCredits: number;
  sortOrder: number;
  description?: string | null;
}

export interface AIImageEditModeAdmin extends AIImageEditModePublic {
  providerId?: string | null;
  provider?: {
    id: string;
    code: string;
    name: string;
    baseUrl: string;
    isActive: boolean;
  } | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ShowcaseItemPublic {
  id: string;
  type: ShowcaseItemType;
  title: string;
  prompt: string;
  templateId?: string | null;
  beforeUrl?: string | null;
  afterUrl: string;
  durationMs?: number | null;
  sortOrder: number;
}

export interface PromptTemplatePublic {
  id: string;
  type: GenerationJobType;
  status: PromptTemplateStatus;
  title: string;
  description?: string | null;
  textPrompt: string;
  materialPrompt?: string | null;
  referenceAssetKeys: string[];
  referenceUrls: string[];
  exampleAssetKey?: string | null;
  exampleUrl?: string | null;
  modelCode?: string | null;
  params: Record<string, unknown>;
  tags: string[];
  category?: string | null;
  categories?: string[];
  sortOrder: number;
  isFeatured: boolean;
  usageCount: number;
  sourceChatSessionId?: string | null;
  sourceGenerationJobId?: string | null;
  sourceMessageId?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PromptTemplateCategoryPublic {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationOutputPublic {
  url: string;
  thumbnailUrl?: string | null;
  fallbackUrl?: string | null;
  sourceUrl?: string | null;
  mediaId?: string | null;
  assetId?: string | null;
  assetKey?: string | null;
}

export interface GenerationJobPublic {
  id: string;
  type: GenerationJobType;
  status: GenerationJobStatus;
  prompt: string;
  modelCode: string;
  modelDisplayName?: string | null;
  params?: Record<string, unknown>;
  progress: number;
  costCredits: number;
  outputUrls: string[];
  providerOutputUrls?: string[];
  providerJobId?: string | null;
  outputItems?: GenerationOutputPublic[];
  chatSessionId?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface StudioEditedResultPublic {
  id: string;
  src: string;
  kind: "image" | "video";
  prompt: string;
  sourceResultId?: string | null;
  createdAt: number;
  messageId?: string;
}

export type MediaCenterKind = "all" | "image" | "video";

export type MediaCenterStatus =
  | "uploading"
  | "ready"
  | "processing"
  | "failed"
  | "deleted"
  | "archived";

export type MediaCenterSource =
  | "generation"
  | "studio_edit"
  | "studio_media"
  | "user_upload"
  | "import";

export type MediaCenterOriginalAccess = "available" | "locked" | "unavailable";

export interface MediaCenterItem {
  id: string;
  kind: "image" | "video";
  status: MediaCenterStatus;
  src: string;
  downloadUrl?: string | null;
  thumbnailUrl?: string | null;
  ossThumbnailUrl?: string | null;
  prompt: string;
  createdAt: string;
  source: MediaCenterSource;
  jobId?: string | null;
  chatSessionId?: string | null;
  originalAccess?: MediaCenterOriginalAccess;
  sizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
}

export interface MediaCenterResponse {
  items: MediaCenterItem[];
  total: number;
  counts: Record<MediaCenterKind, number>;
  limit: number;
  offset: number;
}

export interface CreateJobInput {
  type: GenerationJobType;
  modelCode: string;
  prompt: string;
  params?: Record<string, unknown>;
  inputAssetKey?: string;
  chatSessionId?: string;
}
