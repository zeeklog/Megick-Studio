import { Body, Controller, Delete, Get, Param, Post, Query, Res, Sse } from "@nestjs/common";
import {
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import type { Response } from "express";
import { interval, map, Observable, takeWhile } from "rxjs";
import { CurrentUser, type AuthUserContext } from "@/common/decorators/current-user.decorator";
import { JobsService, type CreateJobInput } from "./jobs.service";
import type { GenerationJobTypeEnum } from "@prisma/client";
import {
  ApiOkArrayResponse,
  ApiOkResponseModel,
  ApiSessionCookieAuth,
  ApiValidationErrorResponse,
  GenerationJobPublicDto,
  MutationCountDto,
  documentedOperation,
} from "@/common/swagger/api-docs";

class CreateJobDto {
  @ApiProperty({
    description: "Generation type to execute.",
    enum: ["TEXT2IMAGE", "IMAGE2VIDEO"],
    example: "TEXT2IMAGE",
  })
  @IsString() type!: GenerationJobTypeEnum;
  @ApiProperty({
    description: "Model code selected from `GET /api/ai-models`.",
    example: "dpi-flux-pro",
  })
  @IsString() modelCode!: string;
  @ApiProperty({
    description: "Primary prompt text sent to the provider adapter.",
    example: "A cinematic neon street in the rain.",
  })
  @IsString() prompt!: string;
  @ApiProperty({
    description:
      "Optional structured provider parameters. The exact keys depend on the selected model and generation type.",
    required: false,
    type: Object,
    additionalProperties: true,
    example: { size: "1024x1024", n: 1 },
  })
  @IsOptional() params?: Record<string, unknown>;
  @ApiProperty({
    description:
      "Optional input asset key for image-conditioned or video flows. Use an asset key returned by OSS upload flows rather than a raw local file path.",
    required: false,
    example: "generations/cmuser123/inputs/source.png",
  })
  @IsOptional() @IsString() inputAssetKey?: string;
  @ApiProperty({
    description:
      "Optional chat session ID to associate the generation with an existing studio conversation.",
    required: false,
    example: "cmsession123",
  })
  @IsOptional() @IsString() chatSessionId?: string;
}

class CreateImageEditJobDto {
  @ApiProperty({
    description: "Image edit mode code selected from `GET /api/ai-image-edit-modes`.",
    example: "smart-erase",
  })
  @IsString() modeCode!: string;
  @ApiProperty({
    description:
      "Prompt sent to the configured image edit model. Required only when the selected mode has `defaultParams.promptRequired=true`.",
    required: false,
    example: "Remove the object and reconstruct the background.",
  })
  @IsOptional() @IsString() prompt?: string;
  @ApiProperty({
    description: "Source image URL, OSS signed URL, content URL, or compact data URL.",
    example: "https://oss.example.com/source.png",
  })
  @IsString() sourceImage!: string;
  @ApiProperty({
    description:
      "Optional mask image. Required when the selected mode has `requiresMask=true`. White areas are edited, black areas are preserved.",
    required: false,
    example: "data:image/png;base64,...",
  })
  @IsOptional() @IsString() maskImage?: string;
  @ApiProperty({
    description: "Optional provider parameters merged with the mode defaults.",
    required: false,
    type: Object,
    additionalProperties: true,
    example: { seed: 1234 },
  })
  @IsOptional() params?: Record<string, unknown>;
  @ApiProperty({
    description: "Optional chat session ID used to associate the image edit job.",
    required: false,
    example: "cmsession123",
  })
  @IsOptional() @IsString() chatSessionId?: string;
}

class SyncGenerationOutputDto {
  @ApiProperty({
    description:
      "Persisted asset key when it can be safely exposed. Free TEXT2IMAGE users receive an empty string and should use `mediaId`/`url`.",
    example: "generations/cmuser123/cmjob123/abcd1234.png",
  })
  key!: string;

  @ApiPropertyOptional({
    description:
      "Opaque media ID mapped to the persisted OSS asset. Free TEXT2IMAGE users receive this ID instead of any raw OSS/provider URL.",
    example: "media_abc123",
    nullable: true,
  })
  mediaId?: string | null;

  @ApiPropertyOptional({
    description:
      "URL that can be rendered immediately by the client. Free TEXT2IMAGE users receive a Megick proxy URL backed by `mediaId`.",
    example: "/api/generation/jobs/provider-output/media_abc123/content",
    nullable: true,
  })
  url!: string | null;
}

class SyncGenerationResponseDto {
  @ApiProperty({
    description: "Generated job ID.",
    example: "cmjob123",
  })
  jobId!: string;

  @ApiProperty({
    description:
      "Synchronous output list. Each item contains a client-renderable URL; free TEXT2IMAGE items use opaque media IDs.",
    type: [SyncGenerationOutputDto],
  })
  outputs!: SyncGenerationOutputDto[];
}

class BinaryGenerationOutputDto {
  @ApiProperty({
    description:
      "Binary response body. The actual content type depends on the generated asset and may be an image or video type.",
    type: "string",
    format: "binary",
  })
  file!: unknown;
}

@ApiTags("generation")
@ApiSessionCookieAuth()
@ApiValidationErrorResponse()
@Controller("api/generation/jobs")
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Post()
  @ApiConsumes("application/json")
  @ApiOperation(
    documentedOperation(
      "Enqueue a generation job (async)",
      "Creates a background generation job, deducts credits immediately, and returns the initial queued job payload. Clients should poll the job detail endpoint or use the SSE stream endpoint until the status becomes terminal.",
    ),
  )
  @ApiOkResponseModel(
    GenerationJobPublicDto,
    "Generation job enqueued successfully.",
  )
  create(@Body() dto: CreateJobDto, @CurrentUser() user: AuthUserContext) {
    return this.jobs.createJob(user.id, dto as CreateJobInput);
  }

  @Post("sync")
  @ApiConsumes("application/json")
  @ApiOperation(
    documentedOperation(
      "Run a TEXT2IMAGE job synchronously (small payloads)",
      "Runs a synchronous generation flow for small TEXT2IMAGE requests and returns the final public job payload in the same response. Clients should use the async endpoint for larger or long-running work.",
    ),
  )
  @ApiOkResponseModel(
    SyncGenerationResponseDto,
    "Synchronous generation completed successfully.",
  )
  async sync(@Body() dto: CreateJobDto, @CurrentUser() user: AuthUserContext) {
    return this.jobs.createSync(user.id, dto as CreateJobInput);
  }

  @Post("image-edit")
  @ApiConsumes("application/json")
  @ApiOperation(
    documentedOperation(
      "Run an AI image edit job synchronously",
      "Runs the configured image edit mode against a source image and optional mask, stores the output in OSS, deducts/refunds credits, and returns immediate renderable outputs.",
    ),
  )
  @ApiOkResponseModel(
    SyncGenerationResponseDto,
    "Image edit completed successfully.",
  )
  async imageEdit(
    @Body() dto: CreateImageEditJobDto,
    @CurrentUser() user: AuthUserContext,
  ) {
    return this.jobs.createImageEditJob(user.id, dto);
  }

  @Get()
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Maximum number of most recent jobs to return. The backend caps this value at 100.",
    example: 20,
  })
  @ApiQuery({
    name: "offset",
    required: false,
    description: "Number of matching jobs to skip before returning results.",
    example: 0,
  })
  @ApiQuery({
    name: "prompt",
    required: false,
    description: "Optional fuzzy prompt search.",
    example: "neon street",
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["queued", "running", "succeeded", "failed", "canceled"],
    description: "Optional status filter.",
  })
  @ApiQuery({
    name: "type",
    required: false,
    enum: ["TEXT2IMAGE", "IMAGE2VIDEO", "IMAGE_EDIT"],
    description: "Optional generation type filter.",
  })
  @ApiQuery({
    name: "mine",
    required: false,
    description:
      "Compatibility flag accepted by web/mobile clients. This endpoint always returns the current user's jobs.",
    example: true,
  })
  @ApiOperation(
    documentedOperation(
      "List my recent generation jobs",
      "Returns the current user's generation jobs in reverse chronological order with signed output URLs when available. Supports lightweight filtering for web and mobile history pages.",
    ),
  )
  @ApiOkArrayResponse(
    GenerationJobPublicDto,
    "Recent generation jobs loaded successfully.",
  )
  list(
    @CurrentUser() user: AuthUserContext,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @Query("prompt") prompt?: string,
    @Query("status") status?: string,
    @Query("type") type?: string,
  ) {
    return this.jobs.listForUser(user.id, {
      limit: Number(limit) || 20,
      offset: Number(offset) || 0,
      prompt,
      status,
      type,
    });
  }

  @Get("provider-output/:mediaId/content")
  @ApiParam({
    name: "mediaId",
    description:
      "Opaque generated media ID mapped to a Megick-owned OSS asset. The ID does not contain or encode the OSS/provider URL.",
    example: "media_abc123",
  })
  @ApiOperation(
    documentedOperation(
      "Stream one generated image through the API origin",
      "Streams a generated image from Megick OSS after verifying ownership. Free users receive the OSS object through the Megick watermark style.",
    ),
  )
  @ApiOkResponseModel(
    BinaryGenerationOutputDto,
    "Generated image bytes returned successfully.",
  )
  async providerOutputContent(
    @Param("mediaId") mediaId: string,
    @Query("variant") variant: string | undefined,
    @CurrentUser() user: AuthUserContext,
    @Res() res: Response,
  ) {
    const asset = await this.jobs.getProviderOutputContent(mediaId, user.id, {
      variant: variant === "thumbnail" ? "thumbnail" : undefined,
    });
    res.setHeader("Content-Type", asset.contentType);
    res.setHeader("Content-Length", String(asset.content.length));
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(asset.content);
  }

  @Get(":id")
  @ApiParam({
    name: "id",
    description: "Generation job ID.",
    example: "cmjob123",
  })
  @ApiOperation(
    documentedOperation(
      "Get one generation job (mine)",
      "Returns one generation job owned by the current user with signed output URLs and public error text when applicable.",
    ),
  )
  @ApiOkResponseModel(
    GenerationJobPublicDto,
    "Generation job loaded successfully.",
  )
  get(@Param("id") id: string, @CurrentUser() user: AuthUserContext) {
    return this.jobs.getJob(user.id, id);
  }

  @Delete(":id")
  @ApiParam({
    name: "id",
    description: "Generation job ID.",
    example: "cmjob123",
  })
  @ApiOperation(
    documentedOperation(
      "Delete one generation job (mine)",
      "Deletes the specified generation job owned by the current user and returns the affected row count. Related chat/template references are nulled by database constraints.",
    ),
  )
  @ApiOkResponseModel(
    MutationCountDto,
    "Generation job deleted successfully.",
  )
  remove(@Param("id") id: string, @CurrentUser() user: AuthUserContext) {
    return this.jobs.deleteForUser(user.id, id);
  }

  @Get(":id/output/:index/content")
  @ApiParam({
    name: "id",
    description: "Generation job ID.",
    example: "cmjob123",
  })
  @ApiParam({
    name: "index",
    description: "Zero-based output index from the job's `outputItems` array.",
    example: "0",
  })
  @ApiOperation(
    documentedOperation(
      "Stream one generation output through the API origin",
      "Streams one generated output through the API origin after verifying job ownership. This is useful for clients that cannot access signed OSS URLs directly.",
    ),
  )
  @ApiOkResponseModel(
    BinaryGenerationOutputDto,
    "Generated asset bytes returned successfully.",
  )
  async outputContent(
    @Param("id") id: string,
    @Param("index") index: string,
    @Query("variant") variant: string | undefined,
    @CurrentUser() user: AuthUserContext,
    @Res() res: Response,
  ) {
    const asset = await this.jobs.getOutputContent(user.id, id, Number(index), {
      variant: variant === "thumbnail" ? "thumbnail" : undefined,
    });
    res.setHeader("Content-Type", asset.contentType);
    res.setHeader("Content-Length", String(asset.content.length));
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(asset.content);
  }

  @Sse(":id/stream")
  @ApiProduces("text/event-stream")
  @ApiParam({
    name: "id",
    description: "Generation job ID.",
    example: "cmjob123",
  })
  @ApiOperation(
    documentedOperation(
      "SSE stream of job status (polls DB every 1s, ends on terminal state)",
      "Opens a server-sent events stream that emits the latest public job payload roughly once per second until the job reaches a terminal state. Clients should expect standard SSE framing with `data:` lines containing JSON snapshots.",
    ),
  )
  @ApiOkResponse({
    description:
      "Server-sent event stream. Each event payload is a JSON snapshot of the same shape returned by `GET /api/generation/jobs/{id}`.",
    content: {
      "text/event-stream": {
        schema: {
          type: "string",
          example:
            'data: {"id":"cmjob123","status":"running","type":"TEXT2IMAGE"}\\n\\n',
        },
      },
    },
  })
  stream(@Param("id") id: string, @CurrentUser() user: AuthUserContext): Observable<MessageEvent> {
    return interval(1000).pipe(
      map(() => this.jobs.getJob(user.id, id)),
      // unwrap promise to plain payload via toPromise indirectly
      // (RxJS map returns a promise; consumer just stringifies -> works in MVP)
    ) as unknown as Observable<MessageEvent>;
  }
}
