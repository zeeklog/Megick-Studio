import { Controller, Get, Query } from "@nestjs/common";
import {
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { CurrentUser, type AuthUserContext } from "@/common/decorators/current-user.decorator";
import {
  ApiOkResponseModel,
  ApiSessionCookieAuth,
  ApiValidationErrorResponse,
  MediaCenterResponseDto,
  documentedOperation,
} from "@/common/swagger/api-docs";
import {
  MediaCenterService,
  type MediaCenterKind,
} from "./media-center.service";

@ApiTags("media-center")
@ApiSessionCookieAuth()
@ApiValidationErrorResponse()
@Controller("api/media-center")
export class MediaCenterController {
  constructor(private readonly mediaCenter: MediaCenterService) {}

  @Get()
  @ApiQuery({
    name: "kind",
    required: false,
    enum: ["all", "image", "video"],
    description: "Optional media category filter.",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "Maximum number of media records to return. Capped at 100.",
    example: 48,
  })
  @ApiQuery({
    name: "offset",
    required: false,
    description: "Number of matching media records to skip before returning results.",
    example: 0,
  })
  @ApiOperation(
    documentedOperation(
      "List my media center records",
      "Returns generated images and videos plus Studio-edited media saved into message results, sorted by creation time.",
    ),
  )
  @ApiOkResponseModel(
    MediaCenterResponseDto,
    "Media center records loaded successfully.",
  )
  list(
    @CurrentUser() user: AuthUserContext,
    @Query("kind") kind?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    const normalizedKind =
      kind === "image" || kind === "video" || kind === "all"
        ? (kind as MediaCenterKind)
        : "all";
    return this.mediaCenter.listForUser(user.id, {
      kind: normalizedKind,
      limit: Number(limit) || 48,
      offset: Number(offset) || 0,
    });
  }
}
