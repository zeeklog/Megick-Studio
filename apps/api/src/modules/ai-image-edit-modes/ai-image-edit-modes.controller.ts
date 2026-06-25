import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiProperty, ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsOptional, IsString } from "class-validator";
import { Public } from "@/common/decorators/public.decorator";
import { Roles } from "@/common/decorators/roles.decorator";
import { AiImageEditModesService } from "./ai-image-edit-modes.service";

class AiImageEditModeDto {
  @ApiProperty({ required: false, example: "cmimageedit123" })
  @IsOptional() @IsString() id?: string;
  @ApiProperty({ example: "smart-erase" })
  @IsString() code!: string;
  @ApiProperty({ example: "智能擦除" })
  @IsString() name!: string;
  @ApiProperty({ required: false, nullable: true, example: "cmprovider123" })
  @IsOptional() @IsString() providerId?: string | null;
  @ApiProperty({ example: "flux-pro-1.0-fill" })
  @IsString() modelName!: string;
  @ApiProperty({ required: false, example: true })
  @IsOptional() @IsBoolean() requiresMask?: boolean;
  @ApiProperty({ required: false, type: Object, additionalProperties: true })
  @IsOptional() defaultParams?: Record<string, unknown>;
  @ApiProperty({ required: false, example: 1 })
  @IsOptional() @IsInt() costCredits?: number;
  @ApiProperty({ required: false, example: true })
  @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiProperty({ required: false, example: 10 })
  @IsOptional() @IsInt() sortOrder?: number;
  @ApiProperty({ required: false, example: "Use FLUX Fill for local edits." })
  @IsOptional() @IsString() description?: string;
}

@ApiTags("ai-image-edit-modes")
@Controller("api/ai-image-edit-modes")
export class PublicAiImageEditModesController {
  constructor(private readonly modes: AiImageEditModesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: "List active AI image edit modes" })
  list() {
    return this.modes.listPublic();
  }
}

@ApiTags("admin/ai-image-edit-modes")
@Roles("SUPER_ADMIN")
@Controller("api/admin/ai-image-edit-modes")
export class AdminAiImageEditModesController {
  constructor(private readonly modes: AiImageEditModesService) {}

  @Get()
  @ApiOperation({ summary: "List AI image edit mode configs" })
  list() {
    return this.modes.listAdmin();
  }

  @Post()
  @ApiOperation({ summary: "Create or update an AI image edit mode" })
  upsert(@Body() dto: AiImageEditModeDto) {
    return this.modes.upsert(dto);
  }

  @Delete(":code")
  @ApiParam({ name: "code", example: "smart-erase" })
  @ApiOperation({ summary: "Delete an AI image edit mode" })
  remove(@Param("code") code: string) {
    return this.modes.delete(code);
  }
}
