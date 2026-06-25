import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { IsBoolean, IsObject, IsOptional, IsString } from "class-validator";
import { CurrentUser, type AuthUserContext } from "@/common/decorators/current-user.decorator";
import { Roles } from "@/common/decorators/roles.decorator";
import {
  paginated,
  parsePagination,
  type PaginationQuery,
} from "@/common/pagination";
import { ChatsService } from "./chats.service";
import {
  AdminChatDetailDto,
  AdminChatRowDto,
  ApiOkArrayResponse,
  ApiOkPaginatedResponse,
  ApiOkResponseModel,
  ApiPaginationQueries,
  ApiSessionCookieAuth,
  ApiValidationErrorResponse,
  ChatSessionDetailDto,
  ChatSessionDto,
  MutationCountDto,
  StudioEditedResultDto,
  documentedOperation,
} from "@/common/swagger/api-docs";

class CreateSessionDto {
  @ApiProperty({
    description:
      "Optional initial chat title. When omitted, the backend stores canonical `New chat`; clients localize default-title display.",
    required: false,
    example: "Neon poster exploration",
  })
  @IsOptional() @IsString() title?: string;
}

class AppendMessageDto {
  @ApiProperty({
    description: "Message role.",
    enum: ["user", "assistant", "system"],
    example: "user",
  })
  @IsString() role!: string;
  @ApiProperty({
    description: "Message text content.",
    example: "Give me three more cinematic poster directions.",
  })
  @IsString() content!: string;
  @ApiProperty({
    description: "Optional linked generation job ID.",
    required: false,
    example: "cmjob123",
  })
  @IsOptional() @IsString() generationJobId?: string;
  @ApiProperty({
    description:
      "Optional structured metadata used by the studio UI. Clients should only send keys they understand and should tolerate additional keys coming back in later reads.",
    required: false,
    type: Object,
    additionalProperties: true,
    example: { settings: { mode: "image", ratio: "1:1" } },
  })
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}

class UpdateSessionDto {
  @ApiProperty({
    description: "Updated session title.",
    required: false,
    example: "Neon poster exploration v2",
  })
  @IsOptional() @IsString() title?: string;
  @ApiProperty({
    description: "Whether the session should be pinned in the dashboard.",
    required: false,
    example: true,
  })
  @IsOptional() @IsBoolean() pinned?: boolean;
  @ApiProperty({
    description: "Whether the session should be archived.",
    required: false,
    example: false,
  })
  @IsOptional() @IsBoolean() archived?: boolean;
}

type UploadedMediaFile = {
  buffer?: Buffer;
  mimetype?: string;
  size?: number;
};

class AppendMediaResultDto {
  @ApiProperty({
    description: "Assistant message text content for the generated media result.",
    example: "【Merged video】Merged long video (3 clips)",
  })
  @IsString() content!: string;

  @ApiProperty({
    description:
      "Optional structured metadata stored on the generated assistant message. May be JSON when sent as multipart form data.",
    required: false,
    type: Object,
    additionalProperties: true,
    example: { status: "done", merged: true, label: "【Merged video】" },
  })
  @IsOptional() metadata?: Record<string, unknown> | string;

  @ApiProperty({
    description: "Optional source result ID(s) the generated media was derived from.",
    required: false,
    example: "cmresult1,cmresult2",
  })
  @IsOptional() @IsString() sourceResultId?: string;
}

interface AdminChatsQuery extends PaginationQuery {
  userId?: string;
  q?: string;
}

class ChatMessageRecordDto {
  @ApiProperty({ description: "Message ID.", example: "cmmsg123" })
  id!: string;

  @ApiProperty({ description: "Parent chat session ID.", example: "cmsession123" })
  sessionId!: string;

  @ApiProperty({ description: "Message role.", enum: ["user", "assistant", "system"], example: "user" })
  role!: string;

  @ApiProperty({ description: "Message text content.", example: "Give me three more cinematic poster directions." })
  content!: string;

  @ApiPropertyOptional({ description: "Linked generation job ID when present.", example: "cmjob123", nullable: true })
  generationJobId?: string | null;

  @ApiPropertyOptional({ description: "Structured message metadata.", type: Object, additionalProperties: true, nullable: true })
  metadata?: Record<string, unknown> | null;

  @ApiProperty({ description: "Creation timestamp.", format: "date-time", example: "2026-05-15T08:00:00.000Z" })
  createdAt!: string;
}

@ApiTags("chats")
@ApiSessionCookieAuth()
@ApiValidationErrorResponse()
@Controller("api/chats")
export class ChatsController {
  constructor(private readonly chats: ChatsService) {}

  @Get()
  @ApiOperation(
    documentedOperation(
      "List chat sessions",
      "Returns the current user's non-archived chat sessions sorted by pinned state and recent activity.",
    ),
  )
  @ApiOkArrayResponse(
    ChatSessionDto,
    "Chat sessions loaded successfully.",
  )
  list(@CurrentUser() user: AuthUserContext) {
    return this.chats.list(user.id);
  }

  @Post()
  @ApiOperation(
    documentedOperation(
      "Create a chat session",
      "Creates a new chat session and returns the persisted session row.",
    ),
  )
  @ApiOkResponseModel(
    ChatSessionDto,
    "Chat session created successfully.",
  )
  create(@Body() dto: CreateSessionDto, @CurrentUser() user: AuthUserContext) {
    return this.chats.createSession(user.id, dto.title);
  }

  @Get(":id")
  @ApiParam({
    name: "id",
    description: "Chat session ID.",
    example: "cmsession123",
  })
  @ApiOperation(
    documentedOperation(
      "Get one chat session",
      "Returns one chat session owned by the current user with messages in ascending creation order and expanded generation results where available.",
    ),
  )
  @ApiOkResponseModel(
    ChatSessionDetailDto,
    "Chat session loaded successfully.",
  )
  detail(
    @Param("id") id: string,
    @Query("limit") limit: string,
    @CurrentUser() user: AuthUserContext,
  ) {
    const messageLimit = limit ? Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100) : undefined;
    return this.chats.detail(user.id, id, messageLimit);
  }

  @Get(":id/messages")
  @ApiParam({
    name: "id",
    description: "Chat session ID.",
    example: "cmsession123",
  })
  @ApiOperation(
    documentedOperation(
      "Paginate chat messages",
      "Returns messages before the given cursor in ascending creation order.",
    ),
  )
  messages(
    @Param("id") id: string,
    @Query("before") before: string,
    @Query("limit") limit: string,
    @CurrentUser() user: AuthUserContext,
  ) {
    const msgLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
    return this.chats.paginateMessages(user.id, id, before || undefined, msgLimit);
  }

  @Patch(":id")
  @ApiParam({
    name: "id",
    description: "Chat session ID.",
    example: "cmsession123",
  })
  @ApiOperation(
    documentedOperation(
      "Update a chat session",
      "Updates mutable chat session fields such as title, pinned state, and archived state.",
    ),
  )
  @ApiOkResponseModel(
    ChatSessionDto,
    "Chat session updated successfully.",
  )
  update(@Param("id") id: string, @Body() dto: UpdateSessionDto, @CurrentUser() user: AuthUserContext) {
    return this.chats.update(user.id, id, dto);
  }

  @Post(":id/messages")
  @ApiParam({
    name: "id",
    description: "Chat session ID.",
    example: "cmsession123",
  })
  @ApiOperation(
    documentedOperation(
      "Append a message to a session",
      "Appends a new chat message to the specified session and refreshes the session's `updatedAt` timestamp.",
    ),
  )
  @ApiOkResponseModel(
    ChatMessageRecordDto,
    "Message appended successfully.",
  )
  append(@Param("id") id: string, @Body() dto: AppendMessageDto, @CurrentUser() user: AuthUserContext) {
    return this.chats.appendMessage(user.id, id, dto);
  }

  @Post(":id/messages/:messageId/edited-results")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 100 * 1024 * 1024 } }))
  @ApiConsumes("multipart/form-data")
  @ApiParam({
    name: "id",
    description: "Chat session ID.",
    example: "cmsession123",
  })
  @ApiParam({
    name: "messageId",
    description: "Assistant message ID that will receive the new edited result.",
    example: "cmmsg123",
  })
  @ApiBody({
    description:
      "Multipart upload containing the edited media file and an optional `sourceResultId` pointing back to the result the user edited.",
    schema: {
      type: "object",
      properties: {
        sourceResultId: {
          type: "string",
          description: "Optional source result ID the new edit was derived from.",
        },
        file: {
          type: "string",
          format: "binary",
          description:
            "Edited media file. Supported types: PNG, JPEG, WEBP, MP4, WEBM, MOV. Maximum size: 100 MB.",
        },
      },
      required: ["file"],
    },
  })
  @ApiOperation(
    documentedOperation(
      "Upload a canvas edit and append it to an assistant message",
      "Uploads an edited media result, stores it in OSS, appends it into the assistant message metadata, and returns the newly created edited result summary.",
    ),
  )
  @ApiOkResponseModel(
    StudioEditedResultDto,
    "Edited result uploaded successfully.",
  )
  appendEditedResult(
    @Param("id") id: string,
    @Param("messageId") messageId: string,
    @Body("sourceResultId") sourceResultId: string | undefined,
    @UploadedFile() file: UploadedMediaFile | undefined,
    @CurrentUser() user: AuthUserContext,
  ) {
    return this.chats.appendEditedResult(user.id, id, messageId, { sourceResultId, file });
  }

  @Post(":id/media-results")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 100 * 1024 * 1024 } }))
  @ApiConsumes("multipart/form-data")
  @ApiParam({
    name: "id",
    description: "Chat session ID.",
    example: "cmsession123",
  })
  @ApiBody({
    description:
      "Multipart upload that creates an assistant message and persists one media result in that message metadata atomically.",
    schema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Assistant message content to store with the media result.",
        },
        metadata: {
          type: "string",
          description: "Optional JSON metadata string for the assistant message.",
        },
        sourceResultId: {
          type: "string",
          description: "Optional source result ID(s) the new media was derived from.",
        },
        file: {
          type: "string",
          format: "binary",
          description:
            "Media file. Supported types: PNG, JPEG, WEBP, MP4, WEBM, MOV. Maximum size: 100 MB.",
        },
      },
      required: ["content", "file"],
    },
  })
  @ApiOperation(
    documentedOperation(
      "Upload a generated media result and append it to a session",
      "Creates an assistant message containing the uploaded media result in metadata, so the Studio can restore the preview after refresh.",
    ),
  )
  @ApiOkResponseModel(
    StudioEditedResultDto,
    "Media result uploaded and appended successfully.",
  )
  appendMediaResult(
    @Param("id") id: string,
    @Body() dto: AppendMediaResultDto,
    @UploadedFile() file: UploadedMediaFile | undefined,
    @CurrentUser() user: AuthUserContext,
  ) {
    return this.chats.appendMediaResult(user.id, id, {
      content: dto.content,
      metadata: dto.metadata,
      sourceResultId: dto.sourceResultId,
      file,
    });
  }

  @Patch(":id/archive")
  @ApiParam({
    name: "id",
    description: "Chat session ID.",
    example: "cmsession123",
  })
  @ApiOperation(
    documentedOperation(
      "Archive a chat session",
      "Marks the specified session as archived for the current user and returns the affected row count.",
    ),
  )
  @ApiOkResponseModel(
    MutationCountDto,
    "Chat session archived successfully.",
  )
  archive(@Param("id") id: string, @CurrentUser() user: AuthUserContext) {
    return this.chats.archive(user.id, id);
  }

  @Delete(":id")
  @ApiParam({
    name: "id",
    description: "Chat session ID.",
    example: "cmsession123",
  })
  @ApiOperation(
    documentedOperation(
      "Archive a chat session",
      "Soft-deletes the specified chat session for the current user by marking it archived, preserving messages and linked generation records for admin statistics.",
    ),
  )
  @ApiOkResponseModel(
    MutationCountDto,
    "Chat session archived successfully.",
  )
  remove(@Param("id") id: string, @CurrentUser() user: AuthUserContext) {
    return this.chats.delete(user.id, id);
  }
}

@ApiTags("admin/chats")
@ApiSessionCookieAuth(
  "Requires a valid `mg_session` cookie for a SUPER_ADMIN account.",
)
@Roles("SUPER_ADMIN")
@Controller("api/admin/chats")
export class AdminChatsController {
  constructor(private readonly chats: ChatsService) {}

  @Get()
  @ApiPaginationQueries({ defaultPageSize: 25, maxPageSize: 200 })
  @ApiQuery({
    name: "userId",
    required: false,
    description: "Optional owning user ID filter.",
    example: "cmuser123",
  })
  @ApiQuery({
    name: "q",
    required: false,
    description:
      "Optional fuzzy search across session title, prompt text, user identity, and message content.",
    example: "neo",
  })
  @ApiOperation(
    documentedOperation(
      "List user chat sessions for admin review",
      "Returns a paginated admin view of user chat sessions with nested user summary and message/job counts.",
    ),
  )
  @ApiOkPaginatedResponse(
    AdminChatRowDto,
    "Admin chat session page loaded successfully.",
  )
  async list(@Query() query: AdminChatsQuery) {
    const pagination = parsePagination(query, {
      defaultPageSize: 25,
      maxPageSize: 200,
    });
    const { items, total } = await this.chats.listAdmin({
      userId: query.userId,
      q: query.q,
      skip: pagination.skip,
      take: pagination.take,
    });
    return paginated(items, total, pagination);
  }

  @Get(":id")
  @ApiParam({
    name: "id",
    description: "Chat session ID.",
    example: "cmsession123",
  })
  @ApiOperation(
    documentedOperation(
      "Get a full chat session with generated assets for admin review",
      "Returns one chat session with user context, full messages, resolved metadata results, and expanded generation job details for admin review workflows.",
    ),
  )
  @ApiOkResponseModel(
    AdminChatDetailDto,
    "Admin chat session detail loaded successfully.",
  )
  detail(@Param("id") id: string) {
    return this.chats.detailAdmin(id);
  }
}
