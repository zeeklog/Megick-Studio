import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiProperty, ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString } from "class-validator";
import { Public } from "@/common/decorators/public.decorator";
import { Roles } from "@/common/decorators/roles.decorator";
import { ModelProvidersService } from "./model-providers.service";

class ModelProviderDto {
  @ApiProperty({ required: false, example: "cmprovider123" })
  @IsOptional() @IsString() id?: string;
  @ApiProperty({ example: "magickapi" })
  @IsString() code!: string;
  @ApiProperty({ example: "MagickAPI" })
  @IsString() name!: string;
  @ApiProperty({ example: "https://api.magickapi.com" })
  @IsString() baseUrl!: string;
  @ApiProperty({ required: false, enum: ["OPENAI", "CREX", "VOLCENGINE"], example: "OPENAI" })
  @IsOptional() @IsIn(["OPENAI", "CREX", "VOLCENGINE"]) apiStyle?: "OPENAI" | "CREX" | "VOLCENGINE";
  @ApiProperty({ required: false, example: "https://bpi.crex.cn/v1/images/tasks/{taskId}" })
  @IsOptional() @IsString() statusUrl?: string | null;
  @ApiProperty({ required: false, example: 900000 })
  @IsOptional() @IsInt() maxPollDurationMs?: number | null;
  @ApiProperty({ required: false, example: 5000 })
  @IsOptional() @IsInt() pollIntervalMs?: number | null;
  @ApiProperty({ required: false, example: 180 })
  @IsOptional() @IsInt() maxPollAttempts?: number | null;
  @ApiProperty({ required: false, example: "sk-live-123" })
  @IsOptional() @IsString() apiKey?: string;
  @ApiProperty({ required: false, type: Object, additionalProperties: true })
  @IsOptional() extra?: Record<string, unknown>;
  @ApiProperty({ required: false, example: true })
  @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiProperty({ required: false, example: 0 })
  @IsOptional() @IsInt() sortOrder?: number;
}

@ApiTags("model-providers")
@Controller("api/model-providers")
export class PublicModelProvidersController {
  constructor(private readonly providers: ModelProvidersService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "List active model providers" })
  list() {
    return this.providers.listPublic();
  }
}

@ApiTags("admin/model-providers")
@Roles("SUPER_ADMIN")
@Controller("api/admin/model-providers")
export class ModelProvidersController {
  constructor(private readonly providers: ModelProvidersService) {}

  @Get()
  @ApiOperation({ summary: "List model provider configs" })
  list() {
    return this.providers.listAdmin();
  }

  @Post()
  @ApiOperation({ summary: "Create or update a model provider config" })
  upsert(@Body() dto: ModelProviderDto) {
    return this.providers.upsert(dto);
  }

  @Delete(":code")
  @ApiParam({ name: "code", example: "magickapi" })
  @ApiOperation({ summary: "Delete a model provider config" })
  remove(@Param("code") code: string) {
    return this.providers.delete(code);
  }
}
