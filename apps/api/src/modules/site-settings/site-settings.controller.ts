import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiProperty, ApiQuery, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import { Public } from "@/common/decorators/public.decorator";
import { Roles } from "@/common/decorators/roles.decorator";
import { SiteSettingsService } from "./site-settings.service";
import {
  ApiOkArrayResponse,
  ApiOkResponseModel,
  ApiSessionCookieAuth,
  ApiValidationErrorResponse,
  SiteSettingDto,
  documentedOperation,
} from "@/common/swagger/api-docs";

class UpsertSettingDto {
  @ApiProperty({
    description: "Unique setting key.",
    example: "auth.registrationEnabled",
  })
  @IsString() key!: string;
  @ApiProperty({
    description:
      "JSON setting value. Supported shapes depend on the setting key.",
    required: false,
    type: Object,
    additionalProperties: true,
    example: true,
  })
  @IsOptional() value?: unknown;
  @ApiProperty({
    description: "Optional logical scope such as `auth` or `features`.",
    required: false,
    example: "auth",
  })
  @IsOptional() @IsString() scope?: string;
}

@ApiTags("site-settings")
@Controller("api/site-settings")
export class SiteSettingsController {
  constructor(private readonly settings: SiteSettingsService) {}

  @Public()
  @Get()
  @ApiQuery({
    name: "scope",
    required: false,
    description:
      "Optional scope filter. Public clients commonly request `auth` or `features` separately.",
    example: "auth",
  })
  @ApiOperation(
    documentedOperation(
      "Get all (scoped) public site settings",
      "Returns public site settings as raw key/value rows. Downstream apps should interpret the value shape according to the setting key they requested.",
    ),
  )
  @ApiOkArrayResponse(
    SiteSettingDto,
    "Site settings loaded successfully.",
  )
  list(@Query("scope") scope?: string) {
    return this.settings.list(scope);
  }
}

@ApiTags("admin/site-settings")
@ApiSessionCookieAuth(
  "Requires a valid `mg_session` cookie for a SUPER_ADMIN account.",
)
@ApiValidationErrorResponse()
@Roles("SUPER_ADMIN")
@Controller("api/admin/site-settings")
export class AdminSiteSettingsController {
  constructor(private readonly settings: SiteSettingsService) {}

  @Get()
  @ApiOperation(
    documentedOperation(
      "List all site settings",
      "Returns every stored site setting row for admin configuration screens.",
    ),
  )
  @ApiOkArrayResponse(
    SiteSettingDto,
    "Admin site settings loaded successfully.",
  )
  list() {
    return this.settings.list();
  }

  @Post()
  @ApiOperation(
    documentedOperation(
      "Create or update a site setting",
      "Upserts a site setting row for open-source runtime configuration.",
    ),
  )
  @ApiOkResponseModel(
    SiteSettingDto,
    "Site setting saved successfully.",
  )
  upsert(@Body() dto: UpsertSettingDto) {
    return this.settings.upsert(dto.key, dto.value, dto.scope);
  }

  @Delete(":key")
  @ApiParam({
    name: "key",
    description: "Setting key to delete.",
    example: "auth.registrationEnabled",
  })
  @ApiOperation(
    documentedOperation(
      "Delete a site setting",
      "Deletes a stored site setting row.",
    ),
  )
  @ApiOkResponseModel(
    SiteSettingDto,
    "Site setting deleted successfully.",
  )
  remove(@Param("key") key: string) {
    return this.settings.delete(key);
  }
}
