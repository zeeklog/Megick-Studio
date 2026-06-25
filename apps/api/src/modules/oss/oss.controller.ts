import { BadRequestException, Body, Controller, Get, Post, Query, Res } from "@nestjs/common";
import {
  ApiConsumes,
  ApiFoundResponse,
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import type { Response } from "express";
import { CurrentUser, type AuthUserContext } from "@/common/decorators/current-user.decorator";
import { OssService } from "./oss.service";
import {
  ApiOkResponseModel,
  ApiSessionCookieAuth,
  ApiValidationErrorResponse,
  OssAssetDto,
  OssPostPolicyDto,
  documentedOperation,
  redirectLocationHeader,
} from "@/common/swagger/api-docs";

class SignDto {
  @ApiProperty({
    description:
      "Upload prefix to reserve inside OSS. The backend appends the current user ID automatically before generating the final `keyPrefix`.",
    example: "templates/examples",
  })
  @IsString() prefix!: string;
  @ApiProperty({
    description: "Optional content type restriction enforced by the signed policy.",
    required: false,
    example: "image/png",
  })
  @IsOptional() @IsString() contentType?: string;
  @ApiProperty({
    description: "Optional maximum upload size for the signed policy.",
    required: false,
    example: 104857600,
  })
  @IsOptional() @IsInt() @Min(1) @Max(100 * 1024 * 1024) maxSizeBytes?: number;
}

class RegisterAssetDto {
  @ApiProperty({
    description: "OSS object key that was uploaded with a previously signed POST policy.",
    example: "generations/references/cmuser123/abcd1234.png",
  })
  @IsString() key!: string;

  @ApiProperty({
    description: "Uploaded object content type.",
    required: false,
    example: "image/png",
  })
  @IsOptional() @IsString() contentType?: string;

  @ApiProperty({
    description: "Uploaded object size in bytes.",
    required: false,
    example: 1048576,
  })
  @IsOptional() @IsInt() @Min(0) @Max(100 * 1024 * 1024) sizeBytes?: number;
}

class BufferBinaryProxyResponseDto {
  @ApiProperty({
    description:
      "Binary response body. The actual content type is taken from the stored asset metadata and may be an image, video, or other media type.",
    type: "string",
    format: "binary",
  })
  file!: unknown;
}

@ApiTags("oss")
@ApiSessionCookieAuth()
@ApiValidationErrorResponse()
@Controller("api/oss")
export class OssController {
  constructor(private readonly oss: OssService) {}

  @Post("sign")
  @ApiConsumes("application/json")
  @ApiOperation(
    documentedOperation(
      "Get a browser-direct PostObject signed policy",
      "Returns a short-lived OSS form POST policy. Clients must keep the returned `keyPrefix`, build the final object key under that prefix, and then upload the file directly to OSS.",
    ),
  )
  @ApiOkResponseModel(
    OssPostPolicyDto,
    "Upload policy created successfully. Returns null when OSS is not configured.",
  )
  async sign(@Body() dto: SignDto, @CurrentUser() user: AuthUserContext) {
    const prefix = dto.prefix.replace(/^\/+|\/+$/g, "");
    const avatarMaxSizeBytes = dto.maxSizeBytes ?? 2 * 1024 * 1024;
    const maxSizeBytes =
      prefix === "avatars"
        ? avatarMaxSizeBytes
        : dto.maxSizeBytes;
    if (prefix.startsWith("avatars/")) {
      throw new BadRequestException("INVALID_UPLOAD_PREFIX");
    }
    if (prefix === "avatars") {
      const contentType = dto.contentType?.toLowerCase();
      if (contentType !== "image/png" && contentType !== "image/jpeg") {
        throw new BadRequestException("INVALID_AVATAR_TYPE");
      }
      if (avatarMaxSizeBytes > 2 * 1024 * 1024) {
        throw new BadRequestException("AVATAR_TOO_LARGE");
      }
    }
    return this.oss.signPostObject(
      `${prefix}/${user.id}/`,
      dto.contentType,
      maxSizeBytes,
    );
  }

  @Post("assets")
  @ApiConsumes("application/json")
  @ApiOperation(
    documentedOperation(
      "Register a browser-direct uploaded OSS asset",
      "Creates or updates the private asset record for an object uploaded directly to OSS under the current user's signed upload prefix.",
    ),
  )
  @ApiOkResponseModel(
    OssAssetDto,
    "Uploaded asset registered successfully.",
  )
  async registerAsset(
    @Body() dto: RegisterAssetDto,
    @CurrentUser() user: AuthUserContext,
  ) {
    return this.oss.registerDirectUpload({
      key: dto.key,
      userId: user.id,
      contentType: dto.contentType,
      sizeBytes: dto.sizeBytes,
      visibility: "PRIVATE",
    });
  }

  @Get("sign")
  @ApiQuery({
    name: "key",
    required: true,
    description: "OSS asset key to sign.",
    example: "templates/examples/cmuser123/abcd1234.png",
  })
  @ApiOperation(
    documentedOperation(
      "Get a temporary signed GET URL for an asset key",
      "Resolves an OSS asset key into a temporary signed URL and redirects the caller to that URL. This endpoint is convenient for browser previews and media tags.",
    ),
  )
  @ApiFoundResponse({
    description:
      "Redirects to a temporary signed asset URL. Returns 404 when OSS is not configured or the key is missing.",
    headers: {
      Location: redirectLocationHeader,
    },
  })
  async signGet(
    @Query("key") key: string,
    @Query("x-oss-process") process: string | undefined,
    @CurrentUser() user: AuthUserContext,
    @Res() res: Response,
  ) {
    const url = await this.oss.signAuthorizedGet(key, user, 3600, {
      process,
    });
    if (!url) {
      res.status(404).json({ error: "OSS not configured or key missing" });
      return;
    }
    res.redirect(url);
  }

  @Get("assets/content")
  @ApiQuery({
    name: "key",
    required: true,
    description:
      "OSS asset key or an `/api/oss/...` URL that can be normalized back to an asset key.",
    example: "generations/cmuser123/cmjob123/abcd1234.png",
  })
  @ApiOperation(
    documentedOperation(
      "Stream an owned OSS asset through the API origin",
      "Checks current-user ownership or SUPER_ADMIN access, then streams the asset bytes through the API origin. Use this endpoint when a client cannot talk to OSS directly.",
    ),
  )
  @ApiOkResponseModel(
    BufferBinaryProxyResponseDto,
    "Authorized asset stream returned successfully.",
  )
  async content(
    @Query("key") key: string,
    @CurrentUser() user: AuthUserContext,
    @Res() res: Response,
  ) {
    const asset = await this.oss.getAuthorizedAssetContent(key, user);
    res.setHeader("Content-Type", asset.contentType);
    res.setHeader("Content-Length", String(asset.content.length));
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(asset.content);
  }
}
