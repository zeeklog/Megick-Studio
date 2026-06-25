import { BadRequestException } from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
} from "class-validator";

export const KEEP_EXISTING_SECRET = "__KEEP_EXISTING__";

export class UpsertCloudR2ConfigDto {
  @IsOptional()
  @IsString()
  accountId?: string;

  @IsString()
  @IsNotEmpty()
  endpoint!: string;

  @IsString()
  @IsNotEmpty()
  bucket!: string;

  @IsString()
  @IsNotEmpty()
  accessKeyId!: string;

  @IsString()
  @IsNotEmpty()
  secretAccessKey!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  publicBaseUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  publicDevelopmentUrl?: string;

  @IsOptional()
  @IsString()
  keyPrefix?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(86400)
  presignExpiresSeconds?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertCloudOssConfigDto {
  @IsString()
  @IsNotEmpty()
  region!: string;

  @IsOptional()
  @IsString()
  endpoint?: string;

  @IsString()
  @IsNotEmpty()
  bucket!: string;

  @IsString()
  @IsNotEmpty()
  accessKeyId!: string;

  @IsString()
  @IsNotEmpty()
  accessKeySecret!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  domain?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  publicBaseUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export function normalizeUrlBase(value: string | null | undefined) {
  return value?.trim().replace(/\/+$/, "") || "";
}

export function sanitizeInstallerFileName(fileName: string) {
  const clean = fileName.trim().replace(/[^a-zA-Z0-9._-]/g, "-");
  if (!clean || clean === "." || clean === ".." || clean.includes("..")) {
    throw new BadRequestException("Invalid installer file name");
  }
  if (!/\.(dmg|zip|exe|msi)$/i.test(clean)) {
    throw new BadRequestException("Installer file must be .dmg, .zip, .exe, or .msi");
  }
  return clean;
}
