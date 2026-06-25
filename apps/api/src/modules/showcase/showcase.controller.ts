import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiProperty, ApiQuery, ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsOptional, IsString } from "class-validator";
import { Public } from "@/common/decorators/public.decorator";
import { Roles } from "@/common/decorators/roles.decorator";
import { ShowcaseService } from "./showcase.service";
import type { ShowcaseTypeEnum } from "@prisma/client";
import {
  ApiOkArrayResponse,
  ApiOkResponseModel,
  ApiSessionCookieAuth,
  ApiValidationErrorResponse,
  ShowcaseAdminDto,
  ShowcasePublicDto,
  documentedOperation,
} from "@/common/swagger/api-docs";

class ShowcaseDto {
  @ApiProperty({
    description: "Optional showcase item ID when editing an existing row.",
    required: false,
    example: "cmshowcase123",
  })
  @IsOptional() @IsString() id?: string;
  @ApiProperty({
    description: "Content type represented by this showcase item.",
    enum: ["TEXT2IMAGE", "IMAGE2VIDEO"],
    example: "TEXT2IMAGE",
  })
  @IsString() type!: ShowcaseTypeEnum;
  @ApiProperty({
    description: "Public showcase title.",
    example: "Before/After Poster Polish",
  })
  @IsString() title!: string;
  @ApiProperty({
    description: "Prompt or caption shown to users.",
    example: "Luxury product poster with rain reflections.",
  })
  @IsString() prompt!: string;
  @ApiProperty({
    description: "Optional before asset key or URL.",
    required: false,
    example: "showcase/before.png",
  })
  @IsOptional() @IsString() beforeAssetKey?: string;
  @ApiProperty({
    description: "Required result asset key or URL.",
    example: "showcase/after.png",
  })
  @IsString() afterAssetKey!: string;
  @ApiProperty({
    description: "Optional video duration in milliseconds.",
    required: false,
    example: 6000,
  })
  @IsOptional() @IsInt() durationMs?: number;
  @ApiProperty({
    description: "Optional source marker, for example `template:{id}`.",
    required: false,
    example: "template:cmtemplate123",
  })
  @IsOptional() @IsString() source?: string;
  @ApiProperty({
    description: "Ascending display order.",
    required: false,
    example: 10,
  })
  @IsOptional() @IsInt() sortOrder?: number;
  @ApiProperty({
    description: "Whether the item is visible in public showcase endpoints.",
    required: false,
    example: true,
  })
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags("showcase")
@Controller("api/showcase")
export class ShowcaseController {
  constructor(private readonly showcase: ShowcaseService) {}

  @Public()
  @Get()
  @ApiQuery({
    name: "type",
    required: false,
    description:
      "Optional showcase type filter.",
    example: "TEXT2IMAGE",
  })
  @ApiOperation(
    documentedOperation(
      "List active showcase items",
      "Returns active showcase content for public galleries and landing pages. Asset keys are resolved to signed preview URLs before being returned.",
    ),
  )
  @ApiOkArrayResponse(
    ShowcasePublicDto,
    "Showcase items loaded successfully.",
  )
  list(@Query("type") type?: string) {
    return this.showcase.listPublic(type as ShowcaseTypeEnum | undefined);
  }
}

@ApiTags("admin/showcase")
@ApiSessionCookieAuth(
  "Requires a valid `mg_session` cookie for a SUPER_ADMIN account.",
)
@ApiValidationErrorResponse()
@Roles("SUPER_ADMIN")
@Controller("api/admin/showcase")
export class AdminShowcaseController {
  constructor(private readonly showcase: ShowcaseService) {}

  @Get()
  @ApiOperation(
    documentedOperation(
      "List showcase items for admin",
      "Returns all showcase rows, including inactive items and raw asset keys.",
    ),
  )
  @ApiOkArrayResponse(
    ShowcaseAdminDto,
    "Admin showcase items loaded successfully.",
  )
  listAdmin() {
    return this.showcase.listAdmin();
  }

  @Post()
  @ApiOperation(
    documentedOperation(
      "Create or update a showcase item",
      "Creates a new showcase row or updates an existing one when `id` is present.",
    ),
  )
  @ApiOkResponseModel(
    ShowcaseAdminDto,
    "Showcase item saved successfully.",
  )
  upsert(@Body() dto: ShowcaseDto) {
    return this.showcase.upsert(dto);
  }

  @Delete(":id")
  @ApiParam({
    name: "id",
    description: "Showcase item ID to delete.",
    example: "cmshowcase123",
  })
  @ApiOperation(
    documentedOperation(
      "Delete a showcase item",
      "Deletes the showcase row identified by the given ID.",
    ),
  )
  @ApiOkResponseModel(
    ShowcaseAdminDto,
    "Showcase item deleted successfully.",
  )
  remove(@Param("id") id: string) {
    return this.showcase.delete(id);
  }
}
