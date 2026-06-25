import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Min,
} from "class-validator";

export const DESKTOP_PLATFORMS = ["MAC", "WIN"] as const;
export type DesktopPlatformValue = (typeof DESKTOP_PLATFORMS)[number];

export class PresignDesktopUploadDto {
  @IsIn(DESKTOP_PLATFORMS)
  platform!: DesktopPlatformValue;

  @Matches(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/)
  version!: string;

  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fileSizeBytes?: number;
}

export class CreateDesktopReleaseDto {
  @IsIn(DESKTOP_PLATFORMS)
  platform!: DesktopPlatformValue;

  @Matches(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/)
  version!: string;

  @IsOptional()
  @IsString()
  downloadUrl?: string;

  @IsOptional()
  @IsString()
  r2ObjectKey?: string;

  @IsOptional()
  @IsString()
  fileName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fileSizeBytes?: number;

  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/i)
  sha256?: string;

  @IsOptional()
  @Matches(/^[A-Za-z0-9+/=]{64,128}$/)
  sha512?: string;

  @IsOptional()
  @IsString()
  releaseNotes?: string;

  @IsOptional()
  @IsBoolean()
  isLatest?: boolean;

  @IsOptional()
  @IsBoolean()
  forceUpdate?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateDesktopReleaseDto {
  @IsOptional()
  @IsIn(DESKTOP_PLATFORMS)
  platform?: DesktopPlatformValue;

  @IsOptional()
  @Matches(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/)
  version?: string;

  @IsOptional()
  @IsString()
  downloadUrl?: string;

  @IsOptional()
  @IsString()
  r2ObjectKey?: string | null;

  @IsOptional()
  @IsString()
  fileName?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  fileSizeBytes?: number | null;

  @IsOptional()
  @Matches(/^[a-f0-9]{64}$/i)
  sha256?: string | null;

  @IsOptional()
  @Matches(/^[A-Za-z0-9+/=]{64,128}$/)
  sha512?: string | null;

  @IsOptional()
  @IsString()
  releaseNotes?: string | null;

  @IsOptional()
  @IsBoolean()
  forceUpdate?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class DesktopUpdateQueryDto {
  @IsIn(DESKTOP_PLATFORMS)
  platform!: DesktopPlatformValue;

  @IsOptional()
  @Matches(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/)
  version?: string;
}
