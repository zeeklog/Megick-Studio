import { Type, applyDecorators } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperationOptions,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from "@nestjs/swagger";

const DATE_TIME_EXAMPLE = "2026-05-15T08:00:00.000Z";

const jsonObjectSchema = {
  type: "object",
  additionalProperties: true,
} as const;

const stringArraySchema: {
  type: [StringConstructor];
  example: string[];
} = {
  type: [String],
  example: [],
};

export const sessionCookieResponseHeader = {
  description:
    "HTTP-only session cookie. Native apps or webviews must persist and send this cookie on later protected requests.",
  schema: { type: "string" },
};

export const redirectLocationHeader = {
  description: "Absolute redirect target returned in the Location response header.",
  schema: { type: "string" },
};

export class ApiErrorResponseDto {
  @ApiPropertyOptional({
    description: "HTTP status code. Nest validation errors include this field.",
    example: 400,
  })
  statusCode?: number;

  @ApiProperty({
    description:
      "Human-readable error message. Validation errors may return an array of field messages instead of a single string.",
    oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
    example: "Authentication required",
  })
  message!: string | string[];

  @ApiPropertyOptional({
    description: "Short error label returned by Nest for some exceptions.",
    example: "Unauthorized",
  })
  error?: string;
}

export class OkResponseDto {
  @ApiProperty({
    description: "Operation result flag.",
    example: true,
  })
  ok!: true;
}

export class MutationCountDto {
  @ApiProperty({
    description: "Number of affected rows.",
    example: 1,
  })
  count!: number;
}

export class PaginatedEnvelopeDto {
  @ApiProperty({
    description: "Total number of matching records before pagination is applied.",
    example: 128,
  })
  total!: number;

  @ApiProperty({
    description: "Current page number. Pages start at 1.",
    example: 2,
  })
  page!: number;

  @ApiProperty({
    description: "Number of records returned per page.",
    example: 25,
  })
  pageSize!: number;

  @ApiProperty({
    description: "Total number of pages for the current filter.",
    example: 6,
  })
  pageCount!: number;

  @ApiProperty({
    description: "Whether another page exists after the current page.",
    example: true,
  })
  hasNextPage!: boolean;

  @ApiProperty({
    description: "Whether a page exists before the current page.",
    example: true,
  })
  hasPreviousPage!: boolean;
}

export class SessionUserDto {
  @ApiProperty({ description: "User ID.", example: "cmabc1234567890" })
  id!: string;

  @ApiProperty({ description: "Login email.", example: "creator@example.com" })
  email!: string;

  @ApiProperty({
    description: "Display name shown in the product UI.",
    example: "Neo",
  })
  displayName!: string;

  @ApiPropertyOptional({
    description: "Avatar image URL.",
    example: "https://cdn.megick.com/avatar/neo.png",
    nullable: true,
  })
  avatarUrl?: string | null;

  @ApiProperty({
    description: "User locale currently stored by the platform.",
    example: "en",
  })
  locale!: string;

  @ApiProperty({
    description: "Whether the locale was explicitly selected by the user or inferred from their device.",
    enum: ["device", "explicit"],
    example: "explicit",
  })
  localeSource!: "device" | "explicit";

  @ApiPropertyOptional({
    description: "Last profile update time used to resolve explicit locale preference conflicts.",
    format: "date-time",
    example: DATE_TIME_EXAMPLE,
    nullable: true,
  })
  localeUpdatedAt?: string | null;

  @ApiProperty({
    description: "Primary application role exposed to clients.",
    enum: ["USER", "SUPER_ADMIN"],
    example: "USER",
  })
  role!: "USER" | "SUPER_ADMIN";

  @ApiProperty({
    description: "Whether the current account has SUPER_ADMIN privileges.",
    example: false,
  })
  isSuperAdmin!: boolean;

  @ApiProperty({
    description: "Current credit balance.",
    example: 80,
  })
  credits!: number;

  @ApiProperty({
    description:
      "Whether the account has administrator-managed access to advanced models and original generated assets.",
    example: false,
  })
  hasAdvancedAccess!: boolean;
}

export class AuthMeResponseDto {
  @ApiPropertyOptional({
    description:
      "Current signed-in user. Returns null when the request does not carry a valid session cookie.",
    type: SessionUserDto,
    nullable: true,
  })
  user!: SessionUserDto | null;
}

export class SignupCaptchaResponseDto {
  @ApiProperty({
    description: "Opaque captcha ID to send back in the registration request.",
    example: "kzHnD7uQ1bx1v7Lh3J4pYw1D",
  })
  captchaId!: string;

  @ApiProperty({
    description:
      "Inline SVG image encoded as a data URL. Render it directly in an <img> tag or native webview image component.",
    example: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iLi4uIj4=",
  })
  imageDataUrl!: string;

  @ApiProperty({
    description: "Captcha validity window in seconds.",
    example: 300,
  })
  expiresInSeconds!: number;
}

export class AuthConfigResponseDto {
  @ApiProperty({
    description: "Whether email/password sign-in is currently enabled.",
    example: true,
  })
  passwordLoginEnabled!: boolean;

  @ApiProperty({
    description: "Whether new account registration is currently enabled.",
    example: true,
  })
  registrationEnabled!: boolean;

  @ApiProperty({
    description:
      "Whether email verification is required before creating a password account. This is enabled when SMTP is active and fully configured.",
    example: true,
  })
  registrationEmailVerificationEnabled!: boolean;

  @ApiProperty({
    description:
      "Message shown to end users when registration is disabled. Safe to display directly in client UI.",
    example: "注册功能已关闭，获取注册邀请请邮件：register-invite@megick.com",
  })
  registrationDisabledMessage!: string;

  @ApiProperty({
    description:
      "Enabled public OAuth providers. Values are lowercase because the front-end consumes them directly.",
    type: [String],
    example: ["google", "github", "apple"],
  })
  oauthProviders!: string[];

  @ApiProperty({
    description:
      "Public OAuth client IDs keyed by lowercase provider. Used by browser SDKs such as Google Identity Services; never includes client secrets.",
    example: { google: "1234567890-abc.apps.googleusercontent.com" },
  })
  oauthProviderClientIds!: Record<string, string>;

}

export class UserRoleDto {
  @ApiProperty({ description: "Role ID.", example: "cmrole123" })
  id!: string;

  @ApiProperty({ description: "Role code.", example: "USER" })
  code!: string;

  @ApiProperty({ description: "Role display name.", example: "User" })
  name!: string;

  @ApiPropertyOptional({
    description: "Optional role description maintained by admins.",
    example: "Default product user role",
    nullable: true,
  })
  description?: string | null;

  @ApiProperty({
    description: "Whether this role is a built-in system role.",
    example: true,
  })
  isSystem!: boolean;
}

export class UserRoleAssignmentDto {
  @ApiProperty({
    description: "Role assigned to the user.",
    type: UserRoleDto,
  })
  role!: UserRoleDto;
}

export class UserProfileDto {
  @ApiProperty({
    description: "Display name stored on the user profile.",
    example: "Neo",
  })
  displayName!: string;

  @ApiPropertyOptional({
    description: "Avatar image URL.",
    example: "https://cdn.megick.com/avatar/neo.png",
    nullable: true,
  })
  avatarUrl?: string | null;

  @ApiProperty({
    description: "User locale used by the product UI.",
    example: "en",
  })
  locale!: string;

  @ApiProperty({
    description: "Whether the locale was explicitly selected by the user or inferred from their device.",
    enum: ["device", "explicit"],
    example: "explicit",
  })
  localeSource!: "device" | "explicit";

  @ApiPropertyOptional({
    description: "Last time the profile locale was explicitly changed.",
    format: "date-time",
    example: DATE_TIME_EXAMPLE,
    nullable: true,
  })
  localeUpdatedAt?: string | null;

  @ApiProperty({
    description: "Current credit balance.",
    example: 120,
  })
  credits!: number;

  @ApiProperty({
    description: "Profile creation time.",
    format: "date-time",
    example: DATE_TIME_EXAMPLE,
  })
  createdAt!: string;

  @ApiProperty({
    description: "Last profile update time.",
    format: "date-time",
    example: DATE_TIME_EXAMPLE,
  })
  updatedAt!: string;
}

export class UserRecordDto {
  @ApiProperty({ description: "User ID.", example: "cmuser123" })
  id!: string;

  @ApiProperty({ description: "Login email.", example: "creator@example.com" })
  email!: string;

  @ApiProperty({
    description: "Account status enforced by the auth guard.",
    enum: ["ACTIVE", "DISABLED", "PENDING"],
    example: "ACTIVE",
  })
  status!: string;

  @ApiPropertyOptional({
    description: "Most recent successful login time.",
    format: "date-time",
    example: DATE_TIME_EXAMPLE,
    nullable: true,
  })
  lastLoginAt?: string | null;

  @ApiProperty({
    description: "Creation timestamp.",
    format: "date-time",
    example: DATE_TIME_EXAMPLE,
  })
  createdAt!: string;

  @ApiProperty({
    description: "Last update timestamp.",
    format: "date-time",
    example: DATE_TIME_EXAMPLE,
  })
  updatedAt!: string;

  @ApiPropertyOptional({
    description: "Profile row attached to the user.",
    type: UserProfileDto,
    nullable: true,
  })
  profile?: UserProfileDto | null;

  @ApiProperty({
    description: "User role assignments.",
    type: [UserRoleAssignmentDto],
  })
  userRoles!: UserRoleAssignmentDto[];
}

export class UserOverviewDto {
  @ApiProperty({ description: "Current credit balance.", example: 120 })
  credits!: number;

  @ApiProperty({
    description:
      "Whether the account has administrator-managed access to advanced models and original generated assets.",
    example: false,
  })
  hasAdvancedAccess!: boolean;

  @ApiProperty({ description: "Absolute total credits spent by this user.", example: 860 })
  totalSpent!: number;

  @ApiProperty({
    description: "Total generation jobs created by the user.",
    example: 42,
  })
  totalGenerations!: number;

  @ApiProperty({
    description: "Rounded generation success rate percentage from 0 to 100.",
    example: 93,
  })
  successRate!: number;
}

export class CreditLedgerEntryDto {
  @ApiProperty({ description: "Ledger entry ID.", example: "cmledger123" })
  id!: string;

  @ApiProperty({
    description: "Signed credit delta for this ledger entry.",
    example: -4,
  })
  delta!: number;

  @ApiProperty({
    description: "Balance after this ledger entry was applied.",
    example: 116,
  })
  balanceAfter!: number;

  @ApiProperty({
    description: "Business-readable reason shown in dashboards.",
    example: "Generation: dpi-text2image",
  })
  reason!: string;

  @ApiPropertyOptional({
    description: "Reference type used for reconciliation.",
    example: "GENERATION_JOB",
    nullable: true,
  })
  refType?: string | null;

  @ApiPropertyOptional({
    description: "Reference ID paired with refType.",
    example: "cmjob123",
    nullable: true,
  })
  refId?: string | null;

  @ApiPropertyOptional({
    description: "Additional metadata recorded for the ledger entry.",
    ...jsonObjectSchema,
    nullable: true,
  })
  metadata?: Record<string, unknown> | null;

  @ApiProperty({
    description: "Creation timestamp.",
    format: "date-time",
    example: DATE_TIME_EXAMPLE,
  })
  createdAt!: string;
}

export class AdminUserRowDto {
  @ApiProperty({ description: "User ID.", example: "cmuser123" })
  id!: string;

  @ApiProperty({ description: "Login email.", example: "creator@example.com" })
  email!: string;

  @ApiProperty({
    description: "Current account status.",
    enum: ["ACTIVE", "DISABLED", "PENDING"],
    example: "ACTIVE",
  })
  status!: string;

  @ApiProperty({
    description: "User creation time.",
    format: "date-time",
    example: DATE_TIME_EXAMPLE,
  })
  createdAt!: string;

  @ApiPropertyOptional({
    description: "Profile summary used by the admin table.",
    type: UserProfileDto,
    nullable: true,
  })
  profile?: UserProfileDto | null;

  @ApiProperty({
    description: "Assigned roles with nested role details.",
    type: [UserRoleAssignmentDto],
  })
  userRoles!: UserRoleAssignmentDto[];
}

export class AdminRecentGenerationJobDto {
  @ApiProperty({ description: "Generation job ID.", example: "cmjob123" })
  id!: string;

  @ApiProperty({ description: "Generation type.", enum: ["TEXT2IMAGE", "IMAGE2VIDEO", "IMAGE_EDIT"], example: "TEXT2IMAGE" })
  type!: string;

  @ApiProperty({ description: "Generation status.", enum: ["queued", "running", "succeeded", "failed", "canceled"], example: "succeeded" })
  status!: string;

  @ApiProperty({ description: "Requested model code.", example: "dpi-flux-pro" })
  modelCode!: string;

  @ApiProperty({ description: "Prompt submitted by the user.", example: "A cinematic neon street in the rain." })
  prompt!: string;

  @ApiProperty({ description: "Credits consumed by the job.", example: 4 })
  costCredits!: number;

  @ApiProperty({ description: "Job creation time.", format: "date-time", example: DATE_TIME_EXAMPLE })
  createdAt!: string;

  @ApiPropertyOptional({ description: "Job completion time.", format: "date-time", example: DATE_TIME_EXAMPLE, nullable: true })
  finishedAt?: string | null;
}

export class AdminUserDashboardUserDto {
  @ApiProperty({ description: "User ID.", example: "cmuser123" })
  id!: string;

  @ApiProperty({ description: "Login email.", example: "creator@example.com" })
  email!: string;

  @ApiProperty({ description: "Current account status.", enum: ["ACTIVE", "DISABLED", "PENDING"], example: "ACTIVE" })
  status!: string;

  @ApiProperty({ description: "Creation timestamp.", format: "date-time", example: DATE_TIME_EXAMPLE })
  createdAt!: string;

  @ApiPropertyOptional({ description: "Most recent successful login time.", format: "date-time", example: DATE_TIME_EXAMPLE, nullable: true })
  lastLoginAt?: string | null;

  @ApiProperty({ description: "Assigned role codes.", type: [String], example: ["USER"] })
  roles!: string[];

  @ApiProperty({ description: "Expanded user profile.", type: UserProfileDto })
  profile!: UserProfileDto;
}

export class AdminUserCreditsSummaryDto {
  @ApiProperty({ description: "Current credit balance.", example: 120 })
  balance!: number;

  @ApiProperty({ description: "Ledger entry count.", example: 96 })
  ledgerEntries!: number;

  @ApiProperty({ description: "Total credits granted over the account lifetime.", example: 980 })
  totalGranted!: number;

  @ApiProperty({ description: "Absolute total credits spent over the account lifetime.", example: 860 })
  totalSpent!: number;

  @ApiProperty({ description: "Most recent ledger entries.", type: [CreditLedgerEntryDto] })
  recentLedger!: CreditLedgerEntryDto[];
}

export class AdminGenerationSummaryDto {
  @ApiProperty({ description: "Total generation jobs ever created.", example: 42 })
  total!: number;

  @ApiProperty({ description: "Generation jobs created in the last 30 days.", example: 15 })
  last30d!: number;

  @ApiProperty({ description: "Succeeded jobs count.", example: 39 })
  succeeded!: number;

  @ApiProperty({ description: "Failed jobs count.", example: 2 })
  failed!: number;

  @ApiProperty({ description: "Running jobs count.", example: 1 })
  running!: number;

  @ApiProperty({ description: "Queued jobs count.", example: 0 })
  queued!: number;

  @ApiProperty({ description: "Canceled jobs count.", example: 0 })
  canceled!: number;

  @ApiProperty({ description: "TEXT2IMAGE jobs count.", example: 37 })
  textToImage!: number;

  @ApiProperty({ description: "IMAGE2VIDEO jobs count.", example: 5 })
  imageToVideo!: number;

  @ApiProperty({ description: "Rounded success rate percentage.", example: 93 })
  successRate!: number;

  @ApiProperty({ description: "Recent generation jobs.", type: [AdminRecentGenerationJobDto] })
  recentJobs!: AdminRecentGenerationJobDto[];
}

export class AdminActivitySummaryDto {
  @ApiProperty({ description: "Chat sessions owned by the user.", example: 18 })
  chatSessions!: number;

  @ApiProperty({ description: "Stored OSS assets owned by the user.", example: 114 })
  assets!: number;
}

export class AdminUserDashboardDto {
  @ApiProperty({ description: "Primary user identity block.", type: AdminUserDashboardUserDto })
  user!: AdminUserDashboardUserDto;

  @ApiProperty({ description: "Overview metrics used by the user dashboard.", type: UserOverviewDto })
  overview!: UserOverviewDto;

  @ApiProperty({ description: "Credit summary block.", type: AdminUserCreditsSummaryDto })
  credits!: AdminUserCreditsSummaryDto;

  @ApiProperty({ description: "Generation summary block.", type: AdminGenerationSummaryDto })
  generations!: AdminGenerationSummaryDto;

  @ApiProperty({ description: "General activity counts.", type: AdminActivitySummaryDto })
  activity!: AdminActivitySummaryDto;
}

export class SmtpConfigSummaryDto {
  @ApiProperty({ description: "Row ID or default fallback.", example: "default" })
  id!: string;

  @ApiProperty({ description: "Whether SMTP sending is enabled.", example: true })
  isActive!: boolean;

  @ApiProperty({ description: "Whether required SMTP settings are complete.", example: true })
  hasConfig!: boolean;

  @ApiProperty({
    description: "Missing required SMTP configuration keys.",
    type: [String],
    example: [],
  })
  missingKeys!: string[];

  @ApiProperty({
    description: "Configured SMTP keys after masking.",
    type: [String],
    example: ["host", "port", "username", "password", "fromEmail"],
  })
  configuredKeys!: string[];

  @ApiProperty({
    description:
      "Masked SMTP config. Password is returned as __KEEP_EXISTING__ when a stored password exists.",
    ...jsonObjectSchema,
  })
  config!: Record<string, unknown>;
}

export class OAuthProviderSafeDto {
  @ApiProperty({ description: "Provider config row ID.", example: "cmoauth123" })
  id!: string;

  @ApiProperty({ description: "OAuth provider code.", enum: ["GOOGLE", "GITHUB", "APPLE"], example: "GOOGLE" })
  provider!: string;

  @ApiProperty({ description: "Configured OAuth client ID.", example: "1234567890-abc.apps.googleusercontent.com" })
  clientId!: string;

  @ApiProperty({ description: "OAuth callback URL registered with the provider.", example: "https://api.example.com/api/auth/google/callback" })
  redirectUri!: string;

  @ApiProperty({ description: "Configured OAuth scopes.", type: [String], example: ["openid", "email", "profile"] })
  scopes!: string[];

  @ApiPropertyOptional({ description: "Provider-specific extra JSON configuration.", ...jsonObjectSchema, nullable: true })
  extra?: Record<string, unknown> | null;

  @ApiProperty({ description: "Whether the provider is active for end-user sign-in.", example: true })
  isActive!: boolean;

  @ApiProperty({ description: "Whether a client secret is currently stored.", example: true })
  hasSecret!: boolean;
}

export class AIModelPublicDto {
  @ApiProperty({ description: "AI model ID.", example: "cmmodel123" })
  id!: string;

  @ApiProperty({ description: "Stable model code used by generation requests.", example: "dpi-flux-pro" })
  code!: string;

  @ApiProperty({ description: "Simplified Chinese display name shown to users in Chinese locales.", example: "豆包 Seedream 5.0 Lite" })
  displayName!: string;

  @ApiPropertyOptional({
    description: "English display name shown to users outside Chinese locales.",
    type: String,
    example: "Seedream 5.0 Lite",
    nullable: true,
  })
  displayNameEn?: string | null;

  @ApiProperty({ description: "Supported generation or utility category.", enum: ["TEXT", "TEXT2IMAGE", "IMAGE2VIDEO"], example: "TEXT2IMAGE" })
  category!: string;

  @ApiProperty({ description: "User access level required to run this model.", enum: ["FREE", "PAID"], example: "PAID" })
  accessLevel!: string;

  @ApiProperty({
    description:
      "Credit unit for this model. TEXT and TEXT2IMAGE consume this many credits per job; IMAGE2VIDEO treats this field as credits per second.",
    example: 28,
  })
  costCredits!: number;

  @ApiProperty({ description: "Whether this model is the default option inside its category.", example: true })
  isDefault!: boolean;

  @ApiProperty({ description: "Whether this model can currently be selected by users.", example: true })
  isActive!: boolean;

  @ApiPropertyOptional({
    description:
      "For TEXT models, usage labels this model can serve, such as video storyboard drafting.",
    type: [String],
    example: ["生视频分镜制作"],
  })
  textUsages?: string[];

  @ApiPropertyOptional({
    description: "For TEXT models, preset system prompt used by utility calls.",
    example: "Draft concise video storyboard prompts for the selected model.",
  })
  systemPrompt?: string;

  @ApiPropertyOptional({
    description:
      "For IMAGE2VIDEO models, indicates whether the model is text-to-video (T2V), image-to-video (I2V), multi-reference video (R2V), or video editing (EDIT).",
    enum: ["T2V", "I2V", "R2V", "EDIT"],
    example: "I2V",
    nullable: true,
  })
  videoInputMode?: string | null;

  @ApiPropertyOptional({
    description:
      "Whether this model supports reference images. For TEXT2IMAGE models this is controlled in admin model config.",
    example: true,
    nullable: true,
  })
  supportsReferenceImages?: boolean;

  @ApiPropertyOptional({
    description:
      "Whether this model requires at least one reference image. For TEXT2IMAGE models this is controlled in admin model config.",
    example: true,
    nullable: true,
  })
  requiresReferenceImages?: boolean;

  @ApiPropertyOptional({
    description: "Minimum number of reference images supported by this model.",
    example: 1,
    nullable: true,
  })
  minReferenceImages?: number;

  @ApiPropertyOptional({
    description: "Maximum number of reference images supported by this model.",
    example: 2,
    nullable: true,
  })
  maxReferenceImages?: number;
}

export class AIModelAdminDto extends AIModelPublicDto {
  @ApiProperty({ description: "Provider base URL.", example: "https://seedanceapi.org/v2" })
  baseUrl!: string;

  @ApiProperty({ description: "Provider model name sent upstream.", example: "flux-pro" })
  modelName!: string;

  @ApiProperty({ description: "Default provider params merged into each job request.", ...jsonObjectSchema })
  defaultParams!: Record<string, unknown>;

  @ApiProperty({ description: "Per-minute request budget tracked for the provider.", example: 60 })
  rateLimitPerMinute!: number;

  @ApiProperty({ description: "Ascending admin sort order.", example: 10 })
  sortOrder!: number;

  @ApiPropertyOptional({ description: "Optional model description shown in admin tools.", example: "Balanced image model.", nullable: true })
  description?: string | null;

  @ApiProperty({ description: "Whether a provider API key is currently stored.", example: true })
  hasApiKey!: boolean;
}

export class GenerationOutputItemDto {
  @ApiProperty({
    description:
      "Primary URL that clients should render. Restricted TEXT2IMAGE outputs may use a Megick proxy URL that serves the OSS object with watermarking applied.",
    example: "https://file.megick.com/generations/cmuser/cmjob/result.png?Expires=...",
  })
  url!: string;

  @ApiPropertyOptional({
    description:
      "Lightweight client-safe preview URL for thumbnail grids. Full-resolution downloads should use url/sourceUrl.",
    example: "/api/generation/jobs/provider-output/media_abc123/content?variant=thumbnail",
    nullable: true,
  })
  thumbnailUrl?: string | null;

  @ApiPropertyOptional({
    description:
      "Secondary fallback URL kept for compatibility. Free TEXT2IMAGE responses do not expose the unwatermarked upstream OSS URL here.",
    example: "https://provider.example.com/result.png",
    nullable: true,
  })
  fallbackUrl?: string | null;

  @ApiPropertyOptional({
    description:
      "Original provider URL before any OSS persistence or proxying. TEXT2IMAGE responses do not expose this URL to clients.",
    example: "https://provider.example.com/result.png",
    nullable: true,
  })
  sourceUrl?: string | null;

  @ApiPropertyOptional({
    description:
      "Opaque media ID for proxied generated media. Free TEXT2IMAGE clients should use this ID/URL instead of OSS asset identifiers.",
    example: "media_abc123",
    nullable: true,
  })
  mediaId?: string | null;

  @ApiPropertyOptional({
    description:
      "Persisted OSS asset ID when it can be safely exposed. Free TEXT2IMAGE responses leave this null.",
    example: "cmasset123",
    nullable: true,
  })
  assetId?: string | null;

  @ApiPropertyOptional({
    description:
      "Persisted OSS asset key when it can be safely exposed. Free TEXT2IMAGE responses leave this null.",
    example: "generations/cmuser/cmjob/abcd1234.png",
    nullable: true,
  })
  assetKey?: string | null;
}

export class GenerationJobPublicDto {
  @ApiProperty({ description: "Generation job ID.", example: "cmjob123" })
  id!: string;

  @ApiProperty({ description: "Generation type requested by the client.", enum: ["TEXT2IMAGE", "IMAGE2VIDEO", "IMAGE_EDIT"], example: "TEXT2IMAGE" })
  type!: string;

  @ApiProperty({ description: "Current generation status.", enum: ["queued", "running", "succeeded", "failed", "canceled"], example: "running" })
  status!: string;

  @ApiProperty({ description: "Original prompt.", example: "A cinematic neon street in the rain." })
  prompt!: string;

  @ApiProperty({ description: "Requested model code.", example: "dpi-flux-pro" })
  modelCode!: string;

  @ApiPropertyOptional({ description: "Human-readable model display name.", example: "DPI Flux Pro", nullable: true })
  modelDisplayName?: string | null;

  @ApiPropertyOptional({ description: "Original structured generation parameters.", ...jsonObjectSchema })
  params?: Record<string, unknown>;

  @ApiProperty({ description: "Generation progress percentage from 0 to 100.", example: 30 })
  progress!: number;

  @ApiProperty({ description: "Credits consumed by the job.", example: 4 })
  costCredits!: number;

  @ApiProperty({
    description: "Flat list of output URLs preserved for backwards compatibility.",
    type: [String],
    example: ["https://oss.example.com/result.png?Expires=..."],
  })
  outputUrls!: string[];

  @ApiPropertyOptional({
    description:
      "Provider output URLs before OSS persistence or proxying. TEXT2IMAGE responses keep these internal and return an empty list.",
    type: [String],
    example: ["https://provider.example.com/result.png"],
  })
  providerOutputUrls?: string[];

  @ApiPropertyOptional({
    description: "Provider job ID when the upstream system exposes one.",
    example: "task_123456",
    nullable: true,
  })
  providerJobId?: string | null;

  @ApiPropertyOptional({
    description:
      "Structured output objects that pair client-renderable URLs with Megick OSS asset identifiers.",
    type: [GenerationOutputItemDto],
  })
  outputItems?: GenerationOutputItemDto[];

  @ApiPropertyOptional({
    description: "Chat session ID linked to this generation flow, if any.",
    example: "cmsession123",
    nullable: true,
  })
  chatSessionId?: string | null;

  @ApiPropertyOptional({
    description: "Public-facing error message when the job failed.",
    example: "Image generation is temporarily unavailable. Please retry later.",
    nullable: true,
  })
  errorMessage?: string | null;

  @ApiProperty({ description: "Creation timestamp.", format: "date-time", example: DATE_TIME_EXAMPLE })
  createdAt!: string;

  @ApiPropertyOptional({ description: "Execution start time.", format: "date-time", example: DATE_TIME_EXAMPLE, nullable: true })
  startedAt?: string | null;

  @ApiPropertyOptional({ description: "Execution finish time.", format: "date-time", example: DATE_TIME_EXAMPLE, nullable: true })
  finishedAt?: string | null;
}

export class MediaCenterCountsDto {
  @ApiProperty({ description: "All media records available to the current user.", example: 42 })
  all!: number;

  @ApiProperty({ description: "Image media records available to the current user.", example: 35 })
  image!: number;

  @ApiProperty({ description: "Video media records available to the current user.", example: 7 })
  video!: number;
}

export class MediaCenterItemDto {
  @ApiProperty({ description: "Stable media record ID.", example: "cmasset123" })
  id!: string;

  @ApiProperty({ description: "Media kind.", enum: ["image", "video"], example: "image" })
  kind!: "image" | "video";

  @ApiProperty({ description: "Media center record status.", enum: ["uploading", "ready", "processing", "failed", "deleted", "archived"], example: "ready" })
  status!: string;

  @ApiProperty({ description: "Client-safe media preview URL.", example: "/api/generation/jobs/provider-output/media_abc123/content" })
  src!: string;

  @ApiPropertyOptional({ description: "Client-safe media download URL.", type: String, example: "/api/generation/jobs/provider-output/media_abc123/content", nullable: true })
  downloadUrl?: string | null;

  @ApiPropertyOptional({ description: "Client-safe thumbnail URL for image list previews. Downloads should keep using downloadUrl/src.", type: String, example: "/api/generation/jobs/provider-output/media_abc123/content?variant=thumbnail", nullable: true })
  thumbnailUrl?: string | null;

  @ApiPropertyOptional({ description: "Deprecated alias for thumbnailUrl kept for older clients.", type: String, example: "/api/generation/jobs/provider-output/media_abc123/content?variant=thumbnail", nullable: true })
  ossThumbnailUrl?: string | null;

  @ApiProperty({ description: "Prompt or assistant message associated with this media.", example: "A cinematic neon street in the rain." })
  prompt!: string;

  @ApiProperty({ description: "Creation timestamp.", format: "date-time", example: DATE_TIME_EXAMPLE })
  createdAt!: string;

  @ApiProperty({ description: "Where the media record came from.", enum: ["generation", "studio_edit", "studio_media", "user_upload", "import"], example: "generation" })
  source!: string;

  @ApiPropertyOptional({ description: "Generation job ID when the media came from a generation task.", example: "cmjob123", nullable: true })
  jobId?: string | null;

  @ApiPropertyOptional({ description: "Studio chat session ID when available.", example: "cmsession123", nullable: true })
  chatSessionId?: string | null;

  @ApiPropertyOptional({ description: "Whether the current user can access the original media bytes through the client-safe URL.", enum: ["available", "locked", "unavailable"], example: "locked" })
  originalAccess?: string;

  @ApiPropertyOptional({ description: "Persisted media size in bytes.", example: 1048576, nullable: true })
  sizeBytes?: number | null;

  @ApiPropertyOptional({ description: "Image or video width in pixels when available.", example: 1024, nullable: true })
  width?: number | null;

  @ApiPropertyOptional({ description: "Image or video height in pixels when available.", example: 1024, nullable: true })
  height?: number | null;

  @ApiPropertyOptional({ description: "Video duration in milliseconds when available.", example: 5000, nullable: true })
  durationMs?: number | null;

}

export class MediaCenterResponseDto {
  @ApiProperty({ description: "Media records for the current page.", type: [MediaCenterItemDto] })
  items!: MediaCenterItemDto[];

  @ApiProperty({ description: "Total number of matching records for the current filter.", example: 42 })
  total!: number;

  @ApiProperty({ description: "Counts by category before pagination.", type: MediaCenterCountsDto })
  counts!: MediaCenterCountsDto;

  @ApiProperty({ description: "Limit applied to this response.", example: 48 })
  limit!: number;

  @ApiProperty({ description: "Offset applied to this response.", example: 0 })
  offset!: number;
}

export class GenerationJobAdminListDto {
  @ApiProperty({ description: "Generation job ID.", example: "cmjob123" })
  id!: string;

  @ApiProperty({ description: "Owning user ID.", example: "cmuser123" })
  userId!: string;

  @ApiProperty({ description: "Generation type.", enum: ["TEXT2IMAGE", "IMAGE2VIDEO", "IMAGE_EDIT"], example: "TEXT2IMAGE" })
  type!: string;

  @ApiProperty({ description: "Current job status.", enum: ["queued", "running", "succeeded", "failed", "canceled"], example: "queued" })
  status!: string;

  @ApiProperty({ description: "Requested model code.", example: "dpi-flux-pro" })
  modelCode!: string;

  @ApiProperty({ description: "Original prompt.", example: "A cinematic neon street in the rain." })
  prompt!: string;

  @ApiProperty({ description: "Credits consumed by the job.", example: 4 })
  costCredits!: number;

  @ApiProperty({
    description: "Owning user summary included for admin search screens.",
    example: { id: "cmuser123", email: "creator@example.com" },
  })
  user!: { id: string; email: string };

  @ApiProperty({ description: "Creation timestamp.", format: "date-time", example: DATE_TIME_EXAMPLE })
  createdAt!: string;
}

export class QueueStatsDto {
  @ApiProperty({ description: "Queue name.", example: "generation" })
  name!: string;

  @ApiProperty({ description: "Waiting jobs count.", example: 3 })
  waiting!: number;

  @ApiProperty({ description: "Active jobs count.", example: 1 })
  active!: number;

  @ApiProperty({ description: "Completed jobs count retained by BullMQ.", example: 520 })
  completed!: number;

  @ApiProperty({ description: "Failed jobs count retained by BullMQ.", example: 12 })
  failed!: number;

  @ApiProperty({ description: "Delayed jobs count.", example: 0 })
  delayed!: number;
}

export class QueueRecentJobDto {
  @ApiPropertyOptional({ description: "BullMQ job ID.", example: "cmjob123", nullable: true })
  id?: string | null;

  @ApiProperty({ description: "BullMQ job name, which mirrors the generation type.", example: "TEXT2IMAGE" })
  name!: string;

  @ApiProperty({ description: "Original BullMQ job data payload.", ...jsonObjectSchema })
  data!: Record<string, unknown>;

  @ApiPropertyOptional({ description: "Failure reason for failed jobs.", example: "OSS_NOT_CONFIGURED", nullable: true })
  failedReason?: string | null;
}

export class QueueRecentResponseDto {
  @ApiProperty({ description: "Recent waiting jobs.", type: [QueueRecentJobDto] })
  waiting!: QueueRecentJobDto[];

  @ApiProperty({ description: "Recent active jobs.", type: [QueueRecentJobDto] })
  active!: QueueRecentJobDto[];

  @ApiProperty({ description: "Recent failed jobs.", type: [QueueRecentJobDto] })
  failed!: QueueRecentJobDto[];

  @ApiProperty({ description: "Recent completed jobs.", type: [QueueRecentJobDto] })
  completed!: QueueRecentJobDto[];
}

export class ChatSessionCountsDto {
  @ApiProperty({ description: "Number of messages in the session.", example: 8 })
  messages!: number;

  @ApiProperty({ description: "Number of linked generation jobs in the session.", example: 3 })
  jobs!: number;
}

export class ChatSessionJobSummaryDto {
  @ApiProperty({ description: "Generation job ID.", example: "cmjob123" })
  id!: string;

  @ApiProperty({ description: "Generation type.", enum: ["TEXT2IMAGE", "IMAGE2VIDEO", "IMAGE_EDIT"], example: "TEXT2IMAGE" })
  type!: string;

  @ApiProperty({ description: "Creation timestamp.", format: "date-time", example: DATE_TIME_EXAMPLE })
  createdAt!: string;
}

export class ChatSessionDto {
  @ApiProperty({ description: "Chat session ID.", example: "cmsession123" })
  id!: string;

  @ApiProperty({ description: "Owning user ID.", example: "cmuser123" })
  userId!: string;

  @ApiProperty({ description: "Session title shown in the sidebar.", example: "Neon poster exploration" })
  title!: string;

  @ApiProperty({ description: "Whether the session is pinned in the dashboard.", example: false })
  pinned!: boolean;

  @ApiProperty({ description: "Whether the session is archived.", example: false })
  archived!: boolean;

  @ApiPropertyOptional({ description: "Studio mode inferred from linked jobs or message metadata.", enum: ["image", "video"], example: "video" })
  mode?: "image" | "video";

  @ApiProperty({ description: "Creation timestamp.", format: "date-time", example: DATE_TIME_EXAMPLE })
  createdAt!: string;

  @ApiProperty({ description: "Last update timestamp.", format: "date-time", example: DATE_TIME_EXAMPLE })
  updatedAt!: string;

  @ApiPropertyOptional({ description: "Optional counts used by list screens.", type: ChatSessionCountsDto })
  _count?: ChatSessionCountsDto;

  @ApiPropertyOptional({
    description: "Linked generation jobs summarized for list filtering and Studio routing.",
    type: [ChatSessionJobSummaryDto],
  })
  jobs?: ChatSessionJobSummaryDto[];
}

export class StudioEditedResultDto {
  @ApiProperty({ description: "Persisted edited asset ID.", example: "cmasset123" })
  id!: string;

  @ApiProperty({ description: "Signed media URL for immediate display.", example: "https://oss.example.com/studio-edits/cmuser/cmsession/edit.webm?Expires=..." })
  src!: string;

  @ApiProperty({ description: "Result kind returned by this endpoint.", enum: ["image", "video"], example: "image" })
  kind!: "image" | "video";

  @ApiProperty({ description: "Assistant prompt associated with the edited result.", example: "Make the background warmer and keep the subject sharp." })
  prompt!: string;

  @ApiPropertyOptional({ description: "Original result ID this edit is derived from.", example: "cmresult123", nullable: true })
  sourceResultId?: string | null;

  @ApiProperty({ description: "Unix timestamp in milliseconds when the edit record was created.", example: 1715740000000 })
  createdAt!: number;

  @ApiPropertyOptional({ description: "Created assistant message ID when the endpoint creates a message.", example: "cmmsg123", nullable: true })
  messageId?: string | null;
}

export class ChatMessageDto {
  @ApiProperty({ description: "Message ID.", example: "cmmsg123" })
  id!: string;

  @ApiProperty({ description: "Parent chat session ID.", example: "cmsession123" })
  sessionId!: string;

  @ApiProperty({ description: "Message role.", enum: ["user", "assistant", "system"], example: "assistant" })
  role!: string;

  @ApiProperty({ description: "Message text content.", example: "Here are three poster directions to explore." })
  content!: string;

  @ApiPropertyOptional({ description: "Linked generation job ID if this message is associated with a generation result.", example: "cmjob123", nullable: true })
  generationJobId?: string | null;

  @ApiPropertyOptional({ description: "Structured metadata used by the studio UI. Clients should read only documented keys they need.", ...jsonObjectSchema, nullable: true })
  metadata?: Record<string, unknown> | null;

  @ApiProperty({ description: "Creation timestamp.", format: "date-time", example: DATE_TIME_EXAMPLE })
  createdAt!: string;

  @ApiPropertyOptional({ description: "Expanded public generation job when available.", type: GenerationJobPublicDto, nullable: true })
  generationJob?: GenerationJobPublicDto | null;
}

export class ChatSessionDetailDto extends ChatSessionDto {
  @ApiProperty({ description: "Session messages in ascending creation order.", type: [ChatMessageDto] })
  messages!: ChatMessageDto[];
}

export class AdminChatUserDto {
  @ApiProperty({ description: "User ID.", example: "cmuser123" })
  id!: string;

  @ApiProperty({ description: "Login email.", example: "creator@example.com" })
  email!: string;

  @ApiPropertyOptional({
    description: "Optional profile summary used by admin list screens.",
    example: { displayName: "Neo" },
    nullable: true,
  })
  profile?: { displayName?: string | null } | null;
}

export class AdminGenerationJobDetailDto extends GenerationJobPublicDto {
  @ApiPropertyOptional({ description: "Raw generation params sent to the provider adapter.", ...jsonObjectSchema })
  declare params?: Record<string, unknown>;

  @ApiPropertyOptional({ description: "Input asset key used by IMAGE2VIDEO or image-conditioned flows.", example: "generations/cmuser/inputs/source.png", nullable: true })
  inputAssetKey?: string | null;

  @ApiPropertyOptional({ description: "Persisted output assets with signed preview URLs.", nullable: true })
  outputAssets?: Array<{
    id: string;
    key: string;
    contentType: string;
    url?: string | null;
    sourceUrl?: string | null;
  }>;
}

export class AdminChatRowDto {
  @ApiProperty({ description: "Chat session ID.", example: "cmsession123" })
  id!: string;

  @ApiProperty({ description: "Session title.", example: "Neon poster exploration" })
  title!: string;

  @ApiProperty({ description: "Whether the session is archived.", example: false })
  archived!: boolean;

  @ApiProperty({ description: "Last update timestamp.", format: "date-time", example: DATE_TIME_EXAMPLE })
  updatedAt!: string;

  @ApiProperty({ description: "Creation timestamp.", format: "date-time", example: DATE_TIME_EXAMPLE })
  createdAt!: string;

  @ApiProperty({ description: "Owning user summary.", type: AdminChatUserDto })
  user!: AdminChatUserDto;

  @ApiPropertyOptional({ description: "Optional count summary.", type: ChatSessionCountsDto })
  _count?: ChatSessionCountsDto;
}

export class AdminChatMessageDto extends ChatMessageDto {
  @ApiPropertyOptional({ description: "Expanded admin generation job payload.", type: AdminGenerationJobDetailDto, nullable: true })
  declare generationJob?: AdminGenerationJobDetailDto | null;
}

export class AdminChatDetailDto extends AdminChatRowDto {
  @ApiProperty({ description: "Session messages in ascending creation order.", type: [AdminChatMessageDto] })
  messages!: AdminChatMessageDto[];
}

export class TemplateCategoryDto {
  @ApiProperty({ description: "Category ID.", example: "cmcat123" })
  id!: string;

  @ApiProperty({ description: "Unique category name used by template filters.", example: "Marketing" })
  name!: string;

  @ApiProperty({ description: "Ascending display order.", example: 10 })
  sortOrder!: number;

  @ApiProperty({ description: "Whether the category is available for selection.", example: true })
  isActive!: boolean;

  @ApiProperty({ description: "Creation timestamp.", format: "date-time", example: DATE_TIME_EXAMPLE })
  createdAt!: string;

  @ApiProperty({ description: "Last update timestamp.", format: "date-time", example: DATE_TIME_EXAMPLE })
  updatedAt!: string;
}

export class PromptTemplateDto {
  @ApiProperty({ description: "Template ID.", example: "cmtemplate123" })
  id!: string;

  @ApiProperty({ description: "Generation type that this template targets.", enum: ["TEXT2IMAGE", "IMAGE2VIDEO"], example: "TEXT2IMAGE" })
  type!: string;

  @ApiProperty({ description: "Publishing status.", enum: ["DRAFT", "PUBLISHED", "ARCHIVED"], example: "PUBLISHED" })
  status!: string;

  @ApiProperty({ description: "Template title shown in galleries and admin tables.", example: "Cyberpunk Product Poster" })
  title!: string;

  @ApiPropertyOptional({ description: "Short template description.", example: "High-contrast hero visual for product launches.", nullable: true })
  description?: string | null;

  @ApiProperty({ description: "Primary user-facing prompt text.", example: "Luxury product shot, cyan rim light, rain reflections, cinematic angle" })
  textPrompt!: string;

  @ApiPropertyOptional({ description: "Secondary material prompt or style prompt.", example: "Brushed aluminum, acrylic glass, subtle fog", nullable: true })
  materialPrompt?: string | null;

  @ApiProperty({ description: "Reference asset keys stored in OSS.", type: [String], example: ["templates/references/abcd1234.png"] })
  referenceAssetKeys!: string[];

  @ApiProperty({ description: "Signed reference asset URLs resolved for clients.", type: [String], example: ["https://oss.example.com/templates/references/abcd1234.png?Expires=..."] })
  referenceUrls!: string[];

  @ApiPropertyOptional({ description: "Primary example asset key.", example: "templates/examples/abcd1234.png", nullable: true })
  exampleAssetKey?: string | null;

  @ApiPropertyOptional({ description: "Signed example asset URL or direct provider URL.", example: "https://oss.example.com/templates/examples/abcd1234.png?Expires=...", nullable: true })
  exampleUrl?: string | null;

  @ApiPropertyOptional({ description: "Suggested model code to pair with this template.", example: "dpi-flux-pro", nullable: true })
  modelCode?: string | null;

  @ApiProperty({ description: "Arbitrary structured template parameters merged into studio state.", ...jsonObjectSchema })
  params!: Record<string, unknown>;

  @ApiProperty({ description: "Tag list used by admin tools and search.", type: [String], example: ["cyberpunk", "product"] })
  tags!: string[];

  @ApiPropertyOptional({ description: "Primary category name kept for backwards compatibility.", example: "Marketing", nullable: true })
  category?: string | null;

  @ApiProperty({ description: "Expanded category list used by current clients.", type: [String], example: ["Marketing", "Campaign"] })
  categories!: string[];

  @ApiProperty({ description: "Ascending display order within lists.", example: 20 })
  sortOrder!: number;

  @ApiProperty({ description: "Whether the template should be featured in galleries.", example: true })
  isFeatured!: boolean;

  @ApiProperty({ description: "Usage count recorded when clients call the use endpoint.", example: 48 })
  usageCount!: number;

  @ApiPropertyOptional({ description: "Source chat session ID when this template was extracted from a conversation.", example: "cmsession123", nullable: true })
  sourceChatSessionId?: string | null;

  @ApiPropertyOptional({ description: "Source generation job ID when this template was extracted from a result.", example: "cmjob123", nullable: true })
  sourceGenerationJobId?: string | null;

  @ApiPropertyOptional({ description: "Source message ID when this template was extracted from a chat message.", example: "cmmsg123", nullable: true })
  sourceMessageId?: string | null;

  @ApiPropertyOptional({ description: "Publish timestamp when the template became public.", format: "date-time", example: DATE_TIME_EXAMPLE, nullable: true })
  publishedAt?: string | null;

  @ApiProperty({ description: "Creation timestamp.", format: "date-time", example: DATE_TIME_EXAMPLE })
  createdAt!: string;

  @ApiProperty({ description: "Last update timestamp.", format: "date-time", example: DATE_TIME_EXAMPLE })
  updatedAt!: string;
}

export class ShowcasePublicDto {
  @ApiProperty({ description: "Showcase item ID.", example: "cmshowcase123" })
  id!: string;

  @ApiProperty({ description: "Content type represented by the showcase item.", enum: ["TEXT2IMAGE", "IMAGE2VIDEO"], example: "TEXT2IMAGE" })
  type!: string;

  @ApiProperty({ description: "Public showcase title.", example: "Before/After Poster Polish" })
  title!: string;

  @ApiProperty({ description: "Prompt or caption used to produce the showcased result.", example: "Luxury product poster with rain reflections." })
  prompt!: string;

  @ApiPropertyOptional({ description: "Template ID extracted from the showcase source value.", example: "cmtemplate123", nullable: true })
  templateId?: string | null;

  @ApiPropertyOptional({ description: "Signed preview URL for the optional before asset.", example: "https://oss.example.com/showcase/before.png?Expires=...", nullable: true })
  beforeUrl?: string | null;

  @ApiProperty({ description: "Signed preview URL for the after asset or a direct provider URL.", example: "https://oss.example.com/showcase/after.png?Expires=..." })
  afterUrl!: string;

  @ApiPropertyOptional({ description: "Video duration in milliseconds for IMAGE2VIDEO showcase items.", example: 6000, nullable: true })
  durationMs?: number | null;

  @ApiProperty({ description: "Ascending public display order.", example: 10 })
  sortOrder!: number;
}

export class ShowcaseAdminDto {
  @ApiProperty({ description: "Showcase item ID.", example: "cmshowcase123" })
  id!: string;

  @ApiProperty({ description: "Content type represented by the showcase item.", enum: ["TEXT2IMAGE", "IMAGE2VIDEO"], example: "TEXT2IMAGE" })
  type!: string;

  @ApiProperty({ description: "Admin title.", example: "Before/After Poster Polish" })
  title!: string;

  @ApiProperty({ description: "Stored prompt or caption.", example: "Luxury product poster with rain reflections." })
  prompt!: string;

  @ApiPropertyOptional({ description: "Optional before asset key.", example: "showcase/before.png", nullable: true })
  beforeAssetKey?: string | null;

  @ApiProperty({ description: "Required result asset key or URL.", example: "showcase/after.png" })
  afterAssetKey!: string;

  @ApiPropertyOptional({ description: "Video duration in milliseconds for IMAGE2VIDEO items.", example: 6000, nullable: true })
  durationMs?: number | null;

  @ApiPropertyOptional({ description: "Optional source marker such as template:{id}.", example: "template:cmtemplate123", nullable: true })
  source?: string | null;

  @ApiProperty({ description: "Ascending admin sort order.", example: 10 })
  sortOrder!: number;

  @ApiProperty({ description: "Whether the item is currently visible publicly.", example: true })
  isActive!: boolean;
}

export class SiteSettingDto {
  @ApiProperty({ description: "Unique setting key.", example: "auth.registrationEnabled" })
  key!: string;

  @ApiProperty({
    description:
      "JSON value stored for the setting. Consumers should interpret the shape according to the setting key described in the endpoint docs.",
    ...jsonObjectSchema,
  })
  value!: unknown;

  @ApiPropertyOptional({
    description: "Optional logical scope such as auth or features.",
    example: "auth",
    nullable: true,
  })
  scope?: string | null;
}

export class PermissionDto {
  @ApiProperty({ description: "Permission ID.", example: "cmperm123" })
  id!: string;

  @ApiProperty({ description: "Permission code.", example: "users.read" })
  code!: string;

  @ApiProperty({ description: "Permission display name.", example: "Read users" })
  name!: string;

  @ApiPropertyOptional({ description: "Permission group.", example: "users", nullable: true })
  group?: string | null;

  @ApiPropertyOptional({ description: "Optional permission description.", example: "Allows viewing user lists and details.", nullable: true })
  description?: string | null;

  @ApiProperty({ description: "Creation timestamp.", format: "date-time", example: DATE_TIME_EXAMPLE })
  createdAt!: string;
}

export class RolePermissionLinkDto {
  @ApiProperty({ description: "Expanded permission record.", type: PermissionDto })
  permission!: PermissionDto;
}

export class RoleUsersCountDto {
  @ApiProperty({ description: "Number of users currently assigned to the role.", example: 42 })
  users!: number;
}

export class RoleWithPermissionsDto {
  @ApiProperty({ description: "Role ID.", example: "cmrole123" })
  id!: string;

  @ApiProperty({ description: "Role code.", example: "SUPER_ADMIN" })
  code!: string;

  @ApiProperty({ description: "Role display name.", example: "Super Admin" })
  name!: string;

  @ApiPropertyOptional({ description: "Optional role description.", example: "Full administrative access.", nullable: true })
  description?: string | null;

  @ApiProperty({ description: "Whether the role is built into the system.", example: true })
  isSystem!: boolean;

  @ApiProperty({ description: "Creation timestamp.", format: "date-time", example: DATE_TIME_EXAMPLE })
  createdAt!: string;

  @ApiProperty({ description: "Last update timestamp.", format: "date-time", example: DATE_TIME_EXAMPLE })
  updatedAt!: string;

  @ApiProperty({ description: "Assigned permissions.", type: [RolePermissionLinkDto] })
  permissions!: RolePermissionLinkDto[];

  @ApiProperty({ description: "User assignment count.", type: RoleUsersCountDto })
  _count!: RoleUsersCountDto;
}

export class AdminDashboardTotalsDto {
  @ApiProperty({ description: "Registered users count.", example: 1240 })
  users!: number;

  @ApiProperty({ description: "Users created in the last 30 days.", example: 183 })
  users30d!: number;

  @ApiProperty({ description: "Generation jobs created in the last 30 days.", example: 9320 })
  jobs30d!: number;

  @ApiProperty({ description: "Successful generation jobs created in the last 30 days.", example: 8812 })
  succeededJobs30d!: number;

  @ApiProperty({ description: "Failed generation jobs created in the last 30 days.", example: 218 })
  failedJobs30d!: number;

  @ApiProperty({ description: "Queued or running generation jobs now.", example: 24 })
  activeJobs!: number;

  @ApiProperty({ description: "Chat sessions created in the last 30 days.", example: 732 })
  chats30d!: number;

  @ApiProperty({ description: "Uploaded or generated assets created in the last 30 days.", example: 1280 })
  assets30d!: number;
}

export class AdminDashboardCreditsDto {
  @ApiProperty({ description: "Current platform-wide credit balance.", example: 582300 })
  totalBalance!: number;

  @ApiProperty({ description: "Credits granted by admins or reward flows in the last 30 days.", example: 12800 })
  granted30d!: number;

  @ApiProperty({ description: "Absolute credits spent in the last hour.", example: 1280 })
  spent1h!: number;

  @ApiProperty({ description: "Absolute credits spent in the last 24 hours.", example: 12480 })
  spent24h!: number;

  @ApiProperty({ description: "Absolute credits spent in the last 7 days.", example: 93200 })
  spent7d!: number;

  @ApiProperty({ description: "Absolute credits spent in the last 30 days.", example: 382400 })
  spent30d!: number;
}

export class AdminDashboardGrowthDto {
  @ApiProperty({ description: "Users created today.", example: 17 })
  usersToday!: number;

  @ApiProperty({ description: "Users created yesterday.", example: 14 })
  usersYesterday!: number;

  @ApiProperty({ description: "Generation jobs created today.", example: 390 })
  jobsToday!: number;

  @ApiProperty({ description: "Generation jobs created yesterday.", example: 354 })
  jobsYesterday!: number;
}

export class AdminDashboardTrendPointDto {
  @ApiProperty({ description: "Calendar day in YYYY-MM-DD.", example: "2026-05-15" })
  date!: string;

  @ApiProperty({ description: "New users on this day.", example: 12 })
  users!: number;

  @ApiProperty({ description: "Generation jobs created on this day.", example: 420 })
  jobs!: number;

  @ApiProperty({ description: "Successful generation jobs created on this day.", example: 389 })
  succeededJobs!: number;

  @ApiProperty({ description: "Failed generation jobs created on this day.", example: 12 })
  failedJobs!: number;

  @ApiProperty({ description: "Chat sessions created on this day.", example: 22 })
  chats!: number;

  @ApiProperty({ description: "OSS assets created on this day.", example: 58 })
  assets!: number;
}

export class AdminDashboardUserLifecycleDto {
  @ApiProperty({ description: "Users who logged in during the last 7 days.", example: 220 })
  active7d!: number;

  @ApiProperty({ description: "Users who logged in during the last 30 days.", example: 740 })
  active30d!: number;

  @ApiProperty({ description: "Users who never logged in.", example: 52 })
  neverLoggedIn!: number;

  @ApiProperty({ description: "Accounts that are pending verification or approval.", example: 8 })
  pendingUsers!: number;

  @ApiProperty({ description: "Disabled accounts.", example: 3 })
  disabledUsers!: number;
}

export class AdminDashboardEngagementDto {
  @ApiProperty({ description: "Users who generated at least one job in the last 30 days.", example: 420 })
  generatingUsers30d!: number;

  @ApiProperty({ description: "Chat sessions created in the last 30 days.", example: 732 })
  chats30d!: number;

  @ApiProperty({ description: "Assets created in the last 30 days.", example: 1280 })
  assets30d!: number;

  @ApiProperty({ description: "Generation success rate for jobs created in the last 30 days.", example: 94.3 })
  generationSuccessRate30d!: number;
}

export class AdminDashboardDto {
  @ApiProperty({ description: "High-level totals used by the admin landing dashboard.", type: AdminDashboardTotalsDto })
  totals!: AdminDashboardTotalsDto;

  @ApiProperty({ description: "Platform credit balance and spend windows.", type: AdminDashboardCreditsDto })
  credits!: AdminDashboardCreditsDto;

  @ApiProperty({ description: "Today versus yesterday movement.", type: AdminDashboardGrowthDto })
  growth!: AdminDashboardGrowthDto;

  @ApiProperty({ description: "User lifecycle and account health metrics.", type: AdminDashboardUserLifecycleDto })
  userLifecycle!: AdminDashboardUserLifecycleDto;

  @ApiProperty({ description: "Open-source edition engagement and generation quality metrics.", type: AdminDashboardEngagementDto })
  engagement!: AdminDashboardEngagementDto;

  @ApiProperty({ description: "14-day daily business trend.", type: [AdminDashboardTrendPointDto] })
  trends!: AdminDashboardTrendPointDto[];

  @ApiProperty({ description: "Generation status distribution for the last 30 days.", example: { succeeded: 8812, failed: 218, running: 12, queued: 8, canceled: 70 } })
  generationStatus30d!: Record<string, number>;

  @ApiProperty({ description: "Generation type distribution for the last 30 days.", example: { TEXT2IMAGE: 6400, IMAGE2VIDEO: 520, IMAGE_EDIT: 900 } })
  generationType30d!: Record<string, number>;
}

export class AdminAuditLogEntryDto {
  @ApiProperty({ description: "Audit row ID.", example: "cmaudit123" })
  id!: string;

  @ApiProperty({ description: "Admin action code.", example: "UPDATE" })
  action!: string;

  @ApiProperty({ description: "Target type affected by the action.", example: "generation_job" })
  targetType!: string;

  @ApiPropertyOptional({ description: "Target ID affected by the action.", example: "cmjob123", nullable: true })
  targetId?: string | null;

  @ApiPropertyOptional({ description: "State before the action when recorded.", ...jsonObjectSchema, nullable: true })
  before?: Record<string, unknown> | null;

  @ApiPropertyOptional({ description: "State after the action when recorded.", ...jsonObjectSchema, nullable: true })
  after?: Record<string, unknown> | null;

  @ApiPropertyOptional({ description: "Requester IP address when recorded.", example: "203.0.113.10", nullable: true })
  ip?: string | null;

  @ApiPropertyOptional({ description: "Requester user-agent when recorded.", example: "Mozilla/5.0", nullable: true })
  userAgent?: string | null;

  @ApiPropertyOptional({ description: "Admin summary when the action came from a signed-in admin.", example: { id: "cmuser123", email: "admin@example.com" }, nullable: true })
  admin?: { id?: string; email?: string } | null;

  @ApiProperty({ description: "Creation timestamp.", format: "date-time", example: DATE_TIME_EXAMPLE })
  createdAt!: string;
}

export class OssPostPolicyDto {
  @ApiProperty({ description: "OSS form POST host.", example: "https://file.megick.com" })
  host!: string;

  @ApiProperty({ description: "OSS access key ID to send in the form.", example: "LTAI5t..." })
  accessKeyId!: string;

  @ApiProperty({ description: "Base64-encoded OSS upload policy.", example: "eyJleHBpcmF0aW9uIjoi..." })
  policy!: string;

  @ApiProperty({ description: "OSS upload signature for the policy.", example: "fN8r4T..." })
  signature!: string;

  @ApiProperty({ description: "Key prefix the client must keep when building the final object key.", example: "templates/examples/cmuser123/" })
  keyPrefix!: string;

  @ApiProperty({ description: "Policy expiration time.", format: "date-time", example: DATE_TIME_EXAMPLE })
  expiration!: string;

  @ApiProperty({ description: "Maximum allowed upload size in bytes.", example: 52428800 })
  maxSizeBytes!: number;
}

export class OssAssetDto {
  @ApiProperty({ description: "Asset record ID.", example: "cmossasset123" })
  id!: string;

  @ApiProperty({ description: "OSS object key.", example: "generations/references/cmuser123/abcd1234.png" })
  key!: string;

  @ApiProperty({ description: "Stored asset content type.", example: "image/png" })
  contentType!: string;

  @ApiProperty({ description: "Asset size in bytes.", example: 1048576 })
  sizeBytes!: number;

  @ApiProperty({ description: "Asset creation timestamp.", format: "date-time", example: DATE_TIME_EXAMPLE })
  createdAt!: string;
}

export function ApiPaginationQueries(options: {
  defaultPageSize: number;
  maxPageSize: number;
}) {
  return applyDecorators(
    ApiQuery({
      name: "page",
      required: false,
      type: Number,
      description: "1-based page number. When omitted, pagination starts from page 1.",
      example: 1,
    }),
    ApiQuery({
      name: "pageSize",
      required: false,
      type: Number,
      description: `Preferred page size. Maximum supported page size for this endpoint is ${options.maxPageSize}.`,
      example: options.defaultPageSize,
    }),
    ApiQuery({
      name: "skip",
      required: false,
      type: Number,
      description:
        "Zero-based record offset. When provided without page, the backend derives page from skip and pageSize.",
      example: 0,
    }),
    ApiQuery({
      name: "take",
      required: false,
      type: Number,
      description: `Alternative page size alias. Maximum supported value is ${options.maxPageSize}.`,
      example: options.defaultPageSize,
    }),
    ApiQuery({
      name: "limit",
      required: false,
      type: Number,
      description: `Alternative page size alias commonly used by lightweight clients. Maximum supported value is ${options.maxPageSize}.`,
      example: options.defaultPageSize,
    }),
  );
}

export function ApiSessionCookieAuth(
  description = "Requires a valid `mg_session` session cookie. All protected requests must send credentials.",
) {
  return applyDecorators(
    ApiCookieAuth("mg_session"),
    ApiUnauthorizedResponse({
      description,
      type: ApiErrorResponseDto,
    }),
  );
}

export function ApiValidationErrorResponse(
  description = "Request parameters or payload failed validation.",
) {
  return ApiBadRequestResponse({
    description,
    type: ApiErrorResponseDto,
  });
}

export function ApiOkArrayResponse<TModel extends Type<unknown>>(
  model: TModel,
  description: string,
) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      description,
      schema: {
        type: "array",
        items: { $ref: getSchemaPath(model) },
      },
    }),
  );
}

export function ApiOkPaginatedResponse<TModel extends Type<unknown>>(
  model: TModel,
  description: string,
) {
  return applyDecorators(
    ApiExtraModels(PaginatedEnvelopeDto, model),
    ApiOkResponse({
      description,
      schema: {
        allOf: [
          { $ref: getSchemaPath(PaginatedEnvelopeDto) },
          {
            properties: {
              items: {
                type: "array",
                items: { $ref: getSchemaPath(model) },
              },
            },
          },
        ],
      },
    }),
  );
}

export function ApiCreatedResponseModel<TModel extends Type<unknown>>(
  model: TModel,
  description: string,
  headers?: Record<string, { description: string; schema: { type: string } }>,
) {
  return ApiCreatedResponse({
    description,
    type: model,
    headers,
  });
}

export function ApiOkResponseModel<TModel extends Type<unknown>>(
  model: TModel,
  description: string,
  headers?: Record<string, { description: string; schema: { type: string } }>,
) {
  return ApiOkResponse({
    description,
    type: model,
    headers,
  });
}

export function documentedOperation(
  summary: string,
  description: string,
): ApiOperationOptions {
  return {
    summary,
    description,
  };
}
