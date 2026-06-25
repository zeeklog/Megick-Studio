import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBody,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
  getSchemaPath,
} from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";
import {
  CurrentUser,
  type AuthUserContext,
} from "@/common/decorators/current-user.decorator";
import { Public } from "@/common/decorators/public.decorator";
import { Roles } from "@/common/decorators/roles.decorator";
import {
  paginated,
  parsePagination,
  type PaginationQuery,
} from "@/common/pagination";
import {
  ApiOkArrayResponse,
  ApiOkPaginatedResponse,
  ApiOkResponseModel,
  ApiPaginationQueries,
  ApiSessionCookieAuth,
  ApiValidationErrorResponse,
  OkResponseDto,
  PaginatedEnvelopeDto,
  PromptTemplateDto,
  TemplateCategoryDto as TemplateCategoryRecordDto,
  documentedOperation,
} from "@/common/swagger/api-docs";
import { TemplatesService } from "./templates.service";
import type {
  GenerationJobTypeEnum,
  PromptTemplateStatus,
} from "@prisma/client";

class TemplateDto {
  @ApiPropertyOptional({
    description:
      "Template ID. Omit when creating a new template. Provide when updating an existing template.",
    example: "cmtemplate123",
  })
  @IsOptional() @IsString() id?: string;

  @ApiProperty({
    description:
      "Generation workflow that this template targets.",
    enum: ["TEXT2IMAGE", "IMAGE2VIDEO"],
    example: "TEXT2IMAGE",
  })
  @IsString() type!: GenerationJobTypeEnum;

  @ApiPropertyOptional({
    description:
      "Publishing state. `DRAFT` hides the template from public lists, `PUBLISHED` exposes it, and `ARCHIVED` retires it.",
    enum: ["DRAFT", "PUBLISHED", "ARCHIVED"],
    example: "PUBLISHED",
  })
  @IsOptional() @IsString() status?: PromptTemplateStatus;

  @ApiProperty({
    description: "Template title shown to operators and end users.",
    example: "Cyberpunk Product Poster",
  })
  @IsString() title!: string;

  @ApiPropertyOptional({
    description: "Short business description used in galleries and admin lists.",
    example: "High-contrast launch creative for tech hardware.",
  })
  @IsOptional() @IsString() description?: string;

  @ApiProperty({
    description:
      "Primary prompt content inserted into Studio or used as the base of the generation request.",
    example:
      "Luxury product shot, cyan rim light, rain reflections, cinematic angle",
  })
  @IsString() textPrompt!: string;

  @ApiPropertyOptional({
    description:
      "Optional material or style prompt appended by clients when building the final generation request.",
    example: "Brushed aluminum, acrylic glass, subtle fog",
  })
  @IsOptional() @IsString() materialPrompt?: string;

  @ApiPropertyOptional({
    description:
      "Reference asset keys already stored in OSS. Clients should treat them as opaque storage keys and prefer the signed URLs returned by read APIs.",
    type: [String],
    example: ["templates/references/cmuser123/ref-001.png"],
  })
  @IsOptional() @IsArray() referenceAssetKeys?: string[];

  @ApiPropertyOptional({
    description:
      "Primary example asset key stored in OSS. This is usually the gallery cover image shown to end users.",
    example: "templates/examples/cmuser123/example-001.png",
  })
  @IsOptional() @IsString() exampleAssetKey?: string;

  @ApiPropertyOptional({
    description:
      "Suggested generation model code that clients can prefill into Studio selectors.",
    example: "dpi-flux-pro",
  })
  @IsOptional() @IsString() modelCode?: string;

  @ApiPropertyOptional({
    description:
      "Structured template defaults merged into the client generation form. Field meanings are workflow-specific.",
    type: "object",
    additionalProperties: true,
    example: { aspectRatio: "1:1", quality: "pro" },
  })
  @IsOptional() @IsObject() params?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: "Search and curation tags maintained by operators.",
    type: [String],
    example: ["cyberpunk", "product"],
  })
  @IsOptional() @IsArray() tags?: string[];

  @ApiPropertyOptional({
    description:
      "Legacy primary category kept for backwards compatibility. New clients should also send `categories`.",
    example: "Marketing",
  })
  @IsOptional() @IsString() category?: string;

  @ApiPropertyOptional({
    description:
      "Expanded category list assigned to the template. Every value must match an existing template category name.",
    type: [String],
    example: ["Marketing", "Campaign"],
  })
  @IsOptional() @IsArray() @IsString({ each: true }) categories?: string[];

  @ApiPropertyOptional({
    description: "Ascending manual sort order within public and admin lists.",
    example: 20,
  })
  @IsOptional() @IsInt() sortOrder?: number;

  @ApiPropertyOptional({
    description: "Whether the template should be highlighted in public listings.",
    example: true,
  })
  @IsOptional() @IsBoolean() isFeatured?: boolean;

  @ApiPropertyOptional({
    description:
      "Source chat session ID when the template was extracted from a conversation.",
    example: "cmsession123",
  })
  @IsOptional() @IsString() sourceChatSessionId?: string;

  @ApiPropertyOptional({
    description:
      "Source generation job ID when the template originated from a generation result.",
    example: "cmjob123",
  })
  @IsOptional() @IsString() sourceGenerationJobId?: string;

  @ApiPropertyOptional({
    description:
      "Source message ID when the template was extracted from a chat message.",
    example: "cmmsg123",
  })
  @IsOptional() @IsString() sourceMessageId?: string;
}

class ExtractTemplateDto {
  @ApiProperty({
    description:
      "Chat session ID used as the extraction source. The backend reads messages in that session to derive prompt, assets, and metadata.",
    example: "cmsession123",
  })
  @IsString() sessionId!: string;

  @ApiPropertyOptional({
    description:
      "Specific message ID to extract from. When omitted, the backend falls back to `generationJobId` and then the latest assistant message with a generation result.",
    example: "cmmsg123",
  })
  @IsOptional() @IsString() messageId?: string;

  @ApiPropertyOptional({
    description:
      "Specific generation job ID to extract from. Useful when the source message is unknown on the client side.",
    example: "cmjob123",
  })
  @IsOptional() @IsString() generationJobId?: string;

  @ApiPropertyOptional({
    description:
      "Existing template ID to overwrite. Omit to create a brand new template from the chat result.",
    example: "cmtemplate123",
  })
  @IsOptional() @IsString() id?: string;

  @ApiPropertyOptional({
    description:
      "Optional override for the detected generation type. When omitted, the backend infers the type from the generation job and chat metadata.",
    enum: ["TEXT2IMAGE", "IMAGE2VIDEO"],
    example: "TEXT2IMAGE",
  })
  @IsOptional() @IsString() type?: GenerationJobTypeEnum;

  @ApiPropertyOptional({
    description:
      "Optional publishing state for the extracted template. Defaults to `DRAFT` when omitted.",
    enum: ["DRAFT", "PUBLISHED", "ARCHIVED"],
    example: "DRAFT",
  })
  @IsOptional() @IsString() status?: PromptTemplateStatus;

  @ApiPropertyOptional({
    description:
      "Optional title override. When omitted, the backend derives a title from the extracted prompt.",
    example: "Sportswear Key Visual",
  })
  @IsOptional() @IsString() title?: string;

  @ApiPropertyOptional({
    description: "Optional human-readable description for the extracted template.",
    example: "Template extracted from a successful apparel campaign run.",
  })
  @IsOptional() @IsString() description?: string;

  @ApiPropertyOptional({
    description:
      "Optional override for the extracted primary prompt text. If omitted, the backend derives it from the source chat and generation job.",
    example:
      "Editorial sportswear photo, moody lights, rain mist, high contrast",
  })
  @IsOptional() @IsString() textPrompt?: string;

  @ApiPropertyOptional({
    description: "Optional override for the extracted material or style prompt.",
    example: "Wet nylon, reflective puddles, stadium ambience",
  })
  @IsOptional() @IsString() materialPrompt?: string;

  @ApiPropertyOptional({
    description:
      "Optional reference asset key overrides. If omitted, the backend derives references from the source message metadata.",
    type: [String],
    example: ["templates/references/cmuser123/ref-001.png"],
  })
  @IsOptional() @IsArray() referenceAssetKeys?: string[];

  @ApiPropertyOptional({
    description:
      "Optional example asset key override. If omitted, the backend tries to derive it from the source generation output.",
    example: "templates/examples/cmuser123/example-001.png",
  })
  @IsOptional() @IsString() exampleAssetKey?: string;

  @ApiPropertyOptional({
    description:
      "Optional model code override. If omitted, the backend uses the source generation model when available.",
    example: "dpi-flux-pro",
  })
  @IsOptional() @IsString() modelCode?: string;

  @ApiPropertyOptional({
    description:
      "Optional structured parameter overrides merged into the extracted template.",
    type: "object",
    additionalProperties: true,
    example: { aspectRatio: "16:9", quality: "pro" },
  })
  @IsOptional() @IsObject() params?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: "Optional tag overrides.",
    type: [String],
    example: ["sportswear", "campaign"],
  })
  @IsOptional() @IsArray() tags?: string[];

  @ApiPropertyOptional({
    description: "Optional legacy primary category override.",
    example: "Advertising",
  })
  @IsOptional() @IsString() category?: string;

  @ApiPropertyOptional({
    description: "Optional full category override.",
    type: [String],
    example: ["Advertising", "Fashion"],
  })
  @IsOptional() @IsArray() @IsString({ each: true }) categories?: string[];

  @ApiPropertyOptional({
    description: "Optional manual sort order override.",
    example: 30,
  })
  @IsOptional() @IsInt() sortOrder?: number;

  @ApiPropertyOptional({
    description: "Whether the extracted template should be featured.",
    example: false,
  })
  @IsOptional() @IsBoolean() isFeatured?: boolean;
}

class TemplateCategoryDto {
  @ApiPropertyOptional({
    description:
      "Category ID. Omit when creating a new category. Provide when updating an existing category.",
    example: "cmcat123",
  })
  @IsOptional() @IsString() id?: string;

  @ApiProperty({
    description:
      "Unique category name used by template filters and assignment APIs.",
    example: "Marketing",
  })
  @IsString() name!: string;

  @ApiPropertyOptional({
    description: "Ascending display order in category lists.",
    example: 10,
  })
  @IsOptional() @IsInt() sortOrder?: number;

  @ApiPropertyOptional({
    description: "Whether the category is selectable in admin tools.",
    example: true,
  })
  @IsOptional() @IsBoolean() isActive?: boolean;
}

interface PublicTemplatesQuery extends PaginationQuery {
  type?: string;
  category?: string;
  q?: string;
  compact?: string | boolean;
}

interface AdminTemplatesQuery extends PaginationQuery {
  type?: string;
  status?: string;
  category?: string;
  q?: string;
}

@ApiTags("templates")
@Controller("api/templates")
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  private readBoolean(value: string | boolean | undefined) {
    return value === true || value === "true" || value === "1";
  }

  @Public()
  @Get()
  @ApiOperation(
    documentedOperation(
      "List published prompt templates",
      "Returns published templates filtered by type, category, and search term. When no pagination parameters are supplied, the response is a plain array for lightweight gallery clients. When any pagination parameter is supplied, the response becomes a paginated envelope with `items` plus pagination metadata.",
    ),
  )
  @ApiExtraModels(PromptTemplateDto, PaginatedEnvelopeDto)
  @ApiQuery({
    name: "type",
    required: false,
    enum: ["TEXT2IMAGE", "IMAGE2VIDEO"],
    description:
      "Generation type filter. `IMAGE2VIDEO` results are suppressed automatically when video generation is disabled by site settings.",
  })
  @ApiQuery({
    name: "category",
    required: false,
    type: String,
    description:
      "Category name filter. Matches either the legacy `category` field or the expanded category assignment list.",
    example: "Marketing",
  })
  @ApiQuery({
    name: "q",
    required: false,
    type: String,
    description:
      "Free-text search across title, description, prompts, and categories.",
    example: "poster",
  })
  @ApiQuery({
    name: "compact",
    required: false,
    schema: { oneOf: [{ type: "boolean" }, { type: "string" }] },
    description:
      "When truthy, the backend omits expensive signed `referenceUrls` expansion in list items. Accepted truthy values are `true` and `1`.",
    example: true,
  })
  @ApiPaginationQueries({ defaultPageSize: 20, maxPageSize: 80 })
  @ApiOkResponse({
    description:
      "Published template list. Response shape depends on whether pagination query parameters are present.",
    schema: {
      oneOf: [
        {
          type: "array",
          items: { $ref: getSchemaPath(PromptTemplateDto) },
        },
        {
          allOf: [
            { $ref: getSchemaPath(PaginatedEnvelopeDto) },
            {
              properties: {
                items: {
                  type: "array",
                  items: { $ref: getSchemaPath(PromptTemplateDto) },
                },
              },
            },
          ],
        },
      ],
    },
  })
  async list(@Query() query: PublicTemplatesQuery) {
    const filters = {
      type: query.type as GenerationJobTypeEnum | undefined,
      category: query.category,
      q: query.q,
      compact: this.readBoolean(query.compact),
    };
    const wantsPagination = Boolean(
      query.page ?? query.pageSize ?? query.skip ?? query.take ?? query.limit,
    );
    if (!wantsPagination) return this.templates.listPublic(filters);

    const pagination = parsePagination(query, {
      defaultPageSize: 20,
      maxPageSize: 80,
    });
    const { items, total } = await this.templates.listPublicPage({
      ...filters,
      skip: pagination.skip,
      take: pagination.take,
    });
    return paginated(items, total, pagination);
  }

  @Public()
  @Get("categories")
  @ApiOperation(
    documentedOperation(
      "List active prompt template categories",
      "Returns only categories that are currently active and meant to be shown to end users.",
    ),
  )
  @ApiOkArrayResponse(
    TemplateCategoryRecordDto,
    "Active template categories sorted by `sortOrder` and name.",
  )
  categories() {
    return this.templates.listCategories({ activeOnly: true });
  }

  @ApiSessionCookieAuth()
  @Get(":id")
  @ApiOperation(
    documentedOperation(
      "Get a published prompt template",
      "Returns the full published template payload including signed example and reference URLs. This endpoint currently requires an authenticated session even though the template itself is public content.",
    ),
  )
  @ApiParam({
    name: "id",
    description: "Prompt template ID returned by list endpoints.",
    example: "cmtemplate123",
  })
  @ApiOkResponseModel(
    PromptTemplateDto,
    "Published template detail including prompt text, categories, signed asset URLs, and source references.",
  )
  detail(@Param("id") id: string) {
    return this.templates.detailPublic(id);
  }

  @ApiSessionCookieAuth()
  @Post(":id/use")
  @ApiOperation(
    documentedOperation(
      "Track a template being inserted into Studio",
      "Increments the template usage counter when a client inserts the template into Studio. Call this once per explicit user selection, not on list rendering.",
    ),
  )
  @ApiParam({
    name: "id",
    description: "Published prompt template ID.",
    example: "cmtemplate123",
  })
  @ApiOkResponseModel(
    OkResponseDto,
    "Acknowledges that the usage counter was incremented.",
  )
  use(@Param("id") id: string) {
    return this.templates.incrementUsage(id);
  }
}

@ApiTags("admin/templates")
@ApiSessionCookieAuth()
@ApiValidationErrorResponse()
@Roles("SUPER_ADMIN")
@Controller("api/admin/templates")
export class AdminTemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @ApiOperation(
    documentedOperation(
      "List templates for admin operations",
      "Returns all prompt templates, including drafts and archived items, in a paginated admin-oriented view.",
    ),
  )
  @ApiQuery({
    name: "type",
    required: false,
    enum: ["TEXT2IMAGE", "IMAGE2VIDEO"],
    description: "Optional generation type filter.",
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["DRAFT", "PUBLISHED", "ARCHIVED"],
    description: "Optional publishing status filter.",
  })
  @ApiQuery({
    name: "category",
    required: false,
    type: String,
    description:
      "Optional category name filter. Matches both the legacy primary category and expanded category assignments.",
    example: "Marketing",
  })
  @ApiQuery({
    name: "q",
    required: false,
    type: String,
    description:
      "Free-text search across title, descriptions, prompts, categories, and model code.",
    example: "flux",
  })
  @ApiPaginationQueries({ defaultPageSize: 25, maxPageSize: 200 })
  @ApiOkPaginatedResponse(
    PromptTemplateDto,
    "Paginated admin template list. Includes draft and archived items.",
  )
  async list(@Query() query: AdminTemplatesQuery) {
    const pagination = parsePagination(query, {
      defaultPageSize: 25,
      maxPageSize: 200,
    });
    const { items, total } = await this.templates.listAdmin({
      type: query.type as GenerationJobTypeEnum | undefined,
      status: query.status as PromptTemplateStatus | undefined,
      category: query.category,
      q: query.q,
      skip: pagination.skip,
      take: pagination.take,
    });
    return paginated(items, total, pagination);
  }

  @Get("categories")
  @ApiOperation(
    documentedOperation(
      "List all template categories for admin tools",
      "Returns active and inactive categories used by the template management console.",
    ),
  )
  @ApiOkArrayResponse(
    TemplateCategoryRecordDto,
    "All template categories sorted by `sortOrder` and name.",
  )
  categories() {
    return this.templates.listCategories();
  }

  @Post("categories")
  @ApiOperation(
    documentedOperation(
      "Create or update a template category",
      "Creates a new category when `id` is omitted, or updates the existing category when `id` is provided.",
    ),
  )
  @ApiBody({
    type: TemplateCategoryDto,
    description:
      "Template category payload. Category names must be unique across the system.",
  })
  @ApiOkResponseModel(
    TemplateCategoryRecordDto,
    "Saved template category row.",
  )
  upsertCategory(@Body() dto: TemplateCategoryDto) {
    return this.templates.upsertCategoryAdmin(dto);
  }

  @Delete("categories/:id")
  @ApiOperation(
    documentedOperation(
      "Delete a template category",
      "Deletes a template category by ID. Downstream callers should remove it from cached filter lists after this call succeeds.",
    ),
  )
  @ApiParam({
    name: "id",
    description: "Template category ID.",
    example: "cmcat123",
  })
  @ApiOkResponseModel(
    TemplateCategoryRecordDto,
    "Deleted template category snapshot.",
  )
  removeCategory(@Param("id") id: string) {
    return this.templates.deleteCategoryAdmin(id);
  }

  @Get(":id")
  @ApiOperation(
    documentedOperation(
      "Get template detail for admin tools",
      "Returns the full admin-facing template payload for editing, auditing, or extracting into other workflows.",
    ),
  )
  @ApiParam({
    name: "id",
    description: "Prompt template ID.",
    example: "cmtemplate123",
  })
  @ApiOkResponseModel(
    PromptTemplateDto,
    "Admin template detail payload.",
  )
  detail(@Param("id") id: string) {
    return this.templates.detailAdmin(id);
  }

  @Post()
  @ApiOperation(
    documentedOperation(
      "Create or update a prompt template",
      "Creates a new template when `id` is omitted, or updates the existing template when `id` is provided. Category names must already exist before this call.",
    ),
  )
  @ApiBody({
    type: TemplateDto,
    description:
      "Template payload to create or update. Reference and example assets must already exist in OSS before their keys are submitted here.",
  })
  @ApiOkResponseModel(
    PromptTemplateDto,
    "Saved template payload after category expansion and signed asset URL resolution.",
  )
  upsert(@Body() dto: TemplateDto, @CurrentUser() user: AuthUserContext) {
    return this.templates.upsertAdmin(user.id, dto);
  }

  @Post("extract-from-chat")
  @ApiOperation(
    documentedOperation(
      "Extract a prompt template from a chat session",
      "Builds a template from a chat session and its linked generation result. When explicit override fields are omitted, the backend derives prompt text, model, reference assets, and example assets from the source conversation.",
    ),
  )
  @ApiBody({
    type: ExtractTemplateDto,
    description:
      "Extraction instructions and optional overrides. `sessionId` is always required.",
  })
  @ApiOkResponseModel(
    PromptTemplateDto,
    "Saved template generated from the chat extraction flow.",
  )
  extract(
    @Body() dto: ExtractTemplateDto,
    @CurrentUser() user: AuthUserContext,
  ) {
    return this.templates.extractFromChat(user.id, dto);
  }

  @Delete(":id")
  @ApiOperation(
    documentedOperation(
      "Delete a prompt template",
      "Deletes the template and returns the deleted template snapshot so admin clients can update local state without re-fetching the list.",
    ),
  )
  @ApiParam({
    name: "id",
    description: "Prompt template ID.",
    example: "cmtemplate123",
  })
  @ApiOkResponseModel(
    PromptTemplateDto,
    "Deleted template snapshot.",
  )
  remove(@Param("id") id: string) {
    return this.templates.deleteAdmin(id);
  }
}
