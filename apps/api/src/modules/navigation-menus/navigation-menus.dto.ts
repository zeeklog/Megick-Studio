import { ApiProperty } from "@nestjs/swagger";
import { NavigationMenuArea } from "@prisma/client";
import { IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString } from "class-validator";

export class NavigationMenuItemDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ enum: NavigationMenuArea })
  @IsEnum(NavigationMenuArea)
  area!: NavigationMenuArea;

  @ApiProperty({ example: "templates" })
  @IsString()
  code!: string;

  @ApiProperty({ example: "模版中心" })
  @IsString()
  label!: string;

  @ApiProperty({ required: false, example: "Templates" })
  @IsOptional()
  @IsString()
  labelEn?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  descriptionEn?: string | null;

  @ApiProperty({ example: "/templates" })
  @IsString()
  href!: string;

  @ApiProperty({ required: false, example: "layout-template" })
  @IsOptional()
  @IsString()
  icon?: string | null;

  @ApiProperty({ required: false, example: false })
  @IsOptional()
  @IsBoolean()
  requiresAuth?: boolean;

  @ApiProperty({ required: false, example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false, example: 10 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
