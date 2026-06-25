import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiProperty, ApiQuery, ApiTags } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString } from "class-validator";
import { Public } from "@/common/decorators/public.decorator";
import { Roles } from "@/common/decorators/roles.decorator";
import { AiModelsService } from "./ai-models.service";
import { AIModelAccessLevel, type AIModelCategory } from "@prisma/client";
import {
  AIModelAdminDto,
  AIModelPublicDto,
  ApiOkArrayResponse,
  ApiOkResponseModel,
  ApiSessionCookieAuth,
  ApiValidationErrorResponse,
  documentedOperation,
} from "@/common/swagger/api-docs";

class AiModelDto {
  @ApiProperty({
    description: "Optional model ID when editing an existing row.",
    required: false,
    example: "cmmodel123",
  })
  @IsOptional() @IsString() id?: string;
  @ApiProperty({
    description: "Stable model code used by generation requests.",
    example: "dpi-flux-pro",
  })
  @IsString() code!: string;
  @ApiProperty({
    description: "Simplified Chinese display name shown to users in Chinese locales.",
    example: "豆包 Seedream 5.0 Lite",
  })
  @IsString() displayName!: string;
  @ApiProperty({
    description:
      "English display name shown to users outside Chinese locales. Falls back to displayName when omitted.",
    type: String,
    required: false,
    nullable: true,
    example: "Seedream 5.0 Lite",
  })
  @IsOptional() @IsString() displayNameEn?: string | null;
  @ApiProperty({
    description: "Generation or utility category supported by this model.",
    enum: ["TEXT", "TEXT2IMAGE", "IMAGE2VIDEO"],
    example: "TEXT2IMAGE",
  })
  @IsString() category!: AIModelCategory;
  @ApiProperty({
    description:
      "For TEXT models, admin-defined usage labels this model can serve, such as video storyboard drafting.",
    required: false,
    isArray: true,
    type: String,
    example: ["生视频分镜制作"],
  })
  @IsOptional() @IsArray() @IsString({ each: true }) textUsages?: string[];
  @ApiProperty({
    description: "For TEXT models, preset system prompt used by utility calls.",
    required: false,
    example: "Draft concise video storyboard prompts for the selected model.",
  })
  @IsOptional() @IsString() systemPrompt?: string;
  @ApiProperty({
    description:
      "For IMAGE2VIDEO models, indicates whether the model is text-to-video, image-to-video, multi-reference video, or video editing.",
    enum: ["T2V", "I2V", "R2V", "EDIT"],
    required: false,
    example: "T2V",
  })
  @IsOptional() @IsIn(["T2V", "I2V", "R2V", "EDIT"]) videoInputMode?: "T2V" | "I2V" | "R2V" | "EDIT";
  @ApiProperty({
    description:
      "Optional model provider config ID. When omitted, the legacy custom base URL and API key fields are used.",
    required: false,
    nullable: true,
    example: "cmprovider123",
  })
  @IsOptional() @IsString() providerId?: string | null;
  @ApiProperty({
    description:
      "Whether the model can be used by everyone or requires administrator-granted advanced access.",
    enum: ["FREE", "PAID"],
    required: false,
    example: "PAID",
  })
  @IsOptional() @IsEnum(AIModelAccessLevel) accessLevel?: AIModelAccessLevel;
  @ApiProperty({
    description: "Provider base URL or gateway URL.",
    example: "https://seedanceapi.org/v2",
  })
  @IsString() baseUrl!: string;
  @ApiProperty({
    description: "Provider model name sent upstream.",
    example: "flux-pro",
  })
  @IsString() modelName!: string;
  @ApiProperty({
    description:
      "Credit unit for this model. TEXT and TEXT2IMAGE consume this many credits per job; IMAGE2VIDEO treats this field as credits per second.",
    example: 28,
  })
  @IsInt() costCredits!: number;
  @ApiProperty({
    description: "Default provider parameters merged into every generation request.",
    required: false,
    type: Object,
    additionalProperties: true,
    example: { size: "1024x1024", n: 1 },
  })
  @IsOptional() defaultParams?: Record<string, unknown>;
  @ApiProperty({
    description: "Per-minute provider budget for admin reference.",
    required: false,
    example: 60,
  })
  @IsOptional() @IsInt() rateLimitPerMinute?: number;
  @ApiProperty({
    description: "Whether the model is selectable by users.",
    required: false,
    example: true,
  })
  @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiProperty({
    description: "Whether the model should be treated as the default option in its category.",
    required: false,
    example: false,
  })
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiProperty({
    description:
      "For TEXT2IMAGE models, whether users may upload reference images with generation requests.",
    required: false,
    example: true,
  })
  @IsOptional() @IsBoolean() supportsReferenceImages?: boolean;
  @ApiProperty({
    description:
      "For TEXT2IMAGE models, whether users must provide at least one reference image. Implies supportsReferenceImages.",
    required: false,
    example: false,
  })
  @IsOptional() @IsBoolean() requiresReferenceImages?: boolean;
  @ApiProperty({
    description: "Ascending display order within the category.",
    required: false,
    example: 10,
  })
  @IsOptional() @IsInt() sortOrder?: number;
  @ApiProperty({
    description: "Optional admin-facing description.",
    required: false,
    example: "Balanced image model for product visuals.",
  })
  @IsOptional() @IsString() description?: string;
  @ApiProperty({
    description:
      "Provider API key. Leave this field empty in update flows if the client does not want to replace the currently stored secret.",
    required: false,
    example: "sk-live-123",
  })
  @IsOptional() @IsString() apiKey?: string;
}

@ApiTags("ai-models")
@Controller("api/ai-models")
export class AiModelsController {
  constructor(private readonly models: AiModelsService) {}

  @Public()
  @Get()
  @ApiQuery({
    name: "category",
    required: false,
    description:
      "Optional model category filter. Supports TEXT utility models as well as image and video generation models.",
    enum: ["TEXT", "TEXT2IMAGE", "IMAGE2VIDEO"],
    example: "TEXT2IMAGE",
  })
  @ApiOperation(
    documentedOperation(
      "List active AI models",
      "Returns the public model catalog that downstream apps should present in creation or utility UIs. Only active and currently enabled model categories are returned.",
    ),
  )
  @ApiOkArrayResponse(
    AIModelPublicDto,
    "Active AI models loaded successfully.",
  )
  list(@Query("category") category?: string) {
    return this.models.listPublic(category as AIModelCategory | undefined);
  }
}

@ApiTags("admin/ai-models")
@ApiSessionCookieAuth(
  "Requires a valid `mg_session` cookie for a SUPER_ADMIN account.",
)
@ApiValidationErrorResponse()
@Roles("SUPER_ADMIN")
@Controller("api/admin/ai-models")
export class AdminAiModelsController {
  constructor(private readonly models: AiModelsService) {}

  @Get()
  @ApiOperation(
    documentedOperation(
      "List all AI models",
      "Returns the full admin model registry, including base URLs, default params, and whether an API key is currently stored.",
    ),
  )
  @ApiOkArrayResponse(
    AIModelAdminDto,
    "Admin AI model list loaded successfully.",
  )
  list() {
    return this.models.listAdmin();
  }

  @Post()
  @ApiOperation(
    documentedOperation(
      "Create or update an AI model",
      "Updates an existing AI model when `id` is provided, otherwise upserts by `code`. When `isDefault=true`, the backend clears the default flag from other models in the same category.",
    ),
  )
  @ApiOkResponseModel(
    AIModelAdminDto,
    "AI model saved successfully.",
  )
  upsert(@Body() dto: AiModelDto) {
    return this.models.upsert(dto);
  }

  @Delete(":code")
  @ApiParam({
    name: "code",
    description: "Model code to delete.",
    example: "legacy-model",
  })
  @ApiOperation(
    documentedOperation(
      "Delete an AI model",
      "Deletes the model row identified by the given code and returns the deleted admin record.",
    ),
  )
  @ApiOkResponseModel(
    AIModelAdminDto,
    "AI model deleted successfully.",
  )
  remove(@Param("code") code: string) {
    return this.models.delete(code);
  }
}
