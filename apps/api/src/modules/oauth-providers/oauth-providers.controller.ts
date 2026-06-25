import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiOperation, ApiProperty, ApiTags } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsOptional, IsString } from "class-validator";
import { Roles } from "@/common/decorators/roles.decorator";
import { OAuthProvidersService } from "./oauth-providers.service";
import type { OAuthProviderEnum } from "@prisma/client";
import {
  ApiOkArrayResponse,
  ApiOkResponseModel,
  ApiSessionCookieAuth,
  ApiValidationErrorResponse,
  OAuthProviderSafeDto,
  documentedOperation,
} from "@/common/swagger/api-docs";

class UpsertOAuthDto {
  @ApiProperty({
    description: "OAuth provider to configure.",
    enum: ["GOOGLE", "GITHUB", "APPLE"],
    example: "GOOGLE",
  })
  @IsString() provider!: OAuthProviderEnum;
  @ApiProperty({
    description: "OAuth client ID issued by the provider.",
    example: "1234567890-abc.apps.googleusercontent.com",
  })
  @IsString() clientId!: string;
  @ApiProperty({
    description:
      "OAuth client secret. Leave empty on update if the client does not want to replace the stored secret.",
    required: false,
    example: "GOCSPX-123",
  })
  @IsOptional() @IsString() clientSecret?: string;
  @ApiProperty({
    description: "Redirect URI registered with the provider.",
    example: "https://api.example.com/api/auth/google/callback",
  })
  @IsString() redirectUri!: string;
  @ApiProperty({
    description: "OAuth scopes to request.",
    required: false,
    type: [String],
    example: ["openid", "email", "profile"],
  })
  @IsOptional() @IsArray() @IsString({ each: true }) scopes?: string[];
  @ApiProperty({
    description: "Provider-specific extra JSON configuration.",
    required: false,
    type: Object,
    additionalProperties: true,
    example: {},
  })
  @IsOptional() extra?: Record<string, unknown>;
  @ApiProperty({
    description: "Whether the provider should be enabled for public sign-in.",
    required: false,
    example: true,
  })
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags("admin/oauth-providers")
@ApiSessionCookieAuth(
  "Requires a valid `mg_session` cookie for a SUPER_ADMIN account.",
)
@ApiValidationErrorResponse()
@Roles("SUPER_ADMIN")
@Controller("api/admin/oauth-providers")
export class OAuthProvidersController {
  constructor(private readonly providers: OAuthProvidersService) {}

  @Get()
  @ApiOperation(
    documentedOperation(
      "List OAuth provider configs",
      "Returns provider configuration rows without exposing stored client secrets.",
    ),
  )
  @ApiOkArrayResponse(
    OAuthProviderSafeDto,
    "OAuth provider configs loaded successfully.",
  )
  list() {
    return this.providers.safeList();
  }

  @Post()
  @ApiOperation(
    documentedOperation(
      "Create or update an OAuth provider config",
      "Upserts the OAuth provider row. When `clientSecret` is omitted during an update, the backend keeps the previously stored secret.",
    ),
  )
  @ApiOkResponseModel(
    OAuthProviderSafeDto,
    "OAuth provider config saved successfully.",
  )
  upsert(@Body() dto: UpsertOAuthDto) {
    return this.providers
      .upsert(dto)
      .then(() => this.providers.safeList())
      .then((rows) => rows.find((row) => row.provider === dto.provider));
  }
}
