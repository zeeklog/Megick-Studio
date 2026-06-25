import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HeadBucketCommand, PutObjectCommand, S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PrismaService } from "nestjs-prisma";
import { CryptoService } from "@/common/services/crypto.service";
import { type PresignDesktopUploadDto } from "../desktop-updates/desktop-updates.dto";
import {
  KEEP_EXISTING_SECRET,
  type UpsertCloudR2ConfigDto,
  normalizeUrlBase,
  sanitizeInstallerFileName,
} from "./cloud-resources.dto";

const DEFAULT_CONFIG_NAME = "default";
const DEFAULT_KEY_PREFIX = "desktop-installers";
const DEFAULT_PRESIGN_EXPIRES_SECONDS = 3600;

interface ResolvedR2Config {
  source: "DB" | "ENV";
  id?: string;
  isActive: boolean;
  accountId: string;
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  publicDevelopmentUrl: string;
  keyPrefix: string;
  presignExpiresSeconds: number;
}

@Injectable()
export class CloudR2Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
  ) {}

  async getAdminConfig() {
    const row = await this.prisma.cloudR2Config.findUnique({ where: { name: DEFAULT_CONFIG_NAME } });
    const resolved = await this.resolveConfig();
    if (row) {
      return {
        id: row.id,
        source: "DB" as const,
        isActive: row.isActive,
        accountId: row.accountId ?? "",
        endpoint: row.endpoint,
        bucket: row.bucket,
        accessKeyId: row.accessKeyId,
        secretAccessKey: row.secretAccessKeyEnc ? KEEP_EXISTING_SECRET : "",
        hasSecretAccessKey: Boolean(row.secretAccessKeyEnc),
        publicBaseUrl: row.publicBaseUrl ?? "",
        publicDevelopmentUrl: row.publicDevelopmentUrl ?? "",
        keyPrefix: row.keyPrefix,
        presignExpiresSeconds: row.presignExpiresSeconds,
        publicDownloadAvailable: Boolean(row.publicBaseUrl || row.publicDevelopmentUrl),
        missingKeys: this.missingKeys(this.decryptRow(row)),
      };
    }

    return {
      source: resolved ? "ENV" : "EMPTY",
      isActive: resolved?.isActive ?? false,
      accountId: resolved?.accountId ?? "",
      endpoint: resolved?.endpoint ?? "",
      bucket: resolved?.bucket ?? "",
      accessKeyId: resolved?.accessKeyId ?? "",
      secretAccessKey: resolved?.secretAccessKey ? KEEP_EXISTING_SECRET : "",
      hasSecretAccessKey: Boolean(resolved?.secretAccessKey),
      publicBaseUrl: resolved?.publicBaseUrl ?? "",
      publicDevelopmentUrl: resolved?.publicDevelopmentUrl ?? "",
      keyPrefix: resolved?.keyPrefix ?? DEFAULT_KEY_PREFIX,
      presignExpiresSeconds: resolved?.presignExpiresSeconds ?? DEFAULT_PRESIGN_EXPIRES_SECONDS,
      publicDownloadAvailable: Boolean(resolved?.publicBaseUrl || resolved?.publicDevelopmentUrl),
      missingKeys: resolved ? this.missingKeys(resolved) : ["endpoint", "bucket", "accessKeyId", "secretAccessKey"],
    };
  }

  async upsertConfig(input: UpsertCloudR2ConfigDto) {
    const existing = await this.prisma.cloudR2Config.findUnique({ where: { name: DEFAULT_CONFIG_NAME } });
    const previousSecret = existing ? this.crypto.decrypt(existing.secretAccessKeyEnc) : "";
    const secretAccessKey = input.secretAccessKey === KEEP_EXISTING_SECRET ? previousSecret : input.secretAccessKey;
    if (!secretAccessKey) throw new BadRequestException("R2 secret access key is required");

    const row = await this.prisma.cloudR2Config.upsert({
      where: { name: DEFAULT_CONFIG_NAME },
      update: {
        accountId: this.trim(input.accountId),
        endpoint: this.trimRequired(input.endpoint, "endpoint"),
        bucket: this.trimRequired(input.bucket, "bucket"),
        accessKeyId: this.trimRequired(input.accessKeyId, "accessKeyId"),
        secretAccessKeyEnc: this.crypto.encrypt(secretAccessKey),
        publicBaseUrl: normalizeUrlBase(input.publicBaseUrl) || null,
        publicDevelopmentUrl: normalizeUrlBase(input.publicDevelopmentUrl) || null,
        keyPrefix: this.normalizePrefix(input.keyPrefix),
        presignExpiresSeconds: input.presignExpiresSeconds ?? DEFAULT_PRESIGN_EXPIRES_SECONDS,
        isActive: input.isActive ?? true,
      },
      create: {
        name: DEFAULT_CONFIG_NAME,
        accountId: this.trim(input.accountId),
        endpoint: this.trimRequired(input.endpoint, "endpoint"),
        bucket: this.trimRequired(input.bucket, "bucket"),
        accessKeyId: this.trimRequired(input.accessKeyId, "accessKeyId"),
        secretAccessKeyEnc: this.crypto.encrypt(secretAccessKey),
        publicBaseUrl: normalizeUrlBase(input.publicBaseUrl) || null,
        publicDevelopmentUrl: normalizeUrlBase(input.publicDevelopmentUrl) || null,
        keyPrefix: this.normalizePrefix(input.keyPrefix),
        presignExpiresSeconds: input.presignExpiresSeconds ?? DEFAULT_PRESIGN_EXPIRES_SECONDS,
        isActive: input.isActive ?? true,
      },
    });

    return {
      id: row.id,
      source: "DB" as const,
      isActive: row.isActive,
      accountId: row.accountId ?? "",
      endpoint: row.endpoint,
      bucket: row.bucket,
      accessKeyId: row.accessKeyId,
      secretAccessKey: KEEP_EXISTING_SECRET,
      hasSecretAccessKey: true,
      publicBaseUrl: row.publicBaseUrl ?? "",
      publicDevelopmentUrl: row.publicDevelopmentUrl ?? "",
      keyPrefix: row.keyPrefix,
      presignExpiresSeconds: row.presignExpiresSeconds,
      missingKeys: this.missingKeys(this.decryptRow(row)),
    };
  }

  async testConfig() {
    const resolved = await this.requireConfig();
    await this.client(resolved).send(new HeadBucketCommand({ Bucket: resolved.bucket }));
    return { ok: true, bucket: resolved.bucket, source: resolved.source };
  }

  async uploadBuffer(input: { objectKey: string; buffer: Buffer; contentType: string }) {
    const resolved = await this.requireConfig();
    await this.client(resolved).send(
      new PutObjectCommand({
        Bucket: resolved.bucket,
        Key: input.objectKey,
        Body: input.buffer,
        ContentType: input.contentType,
        ContentLength: input.buffer.length,
      }),
    );
    return { objectKey: input.objectKey, publicUrl: this.publicUrl(resolved, input.objectKey) };
  }

  async uploadInstaller(input: PresignDesktopUploadDto & { buffer: Buffer }) {
    const resolved = await this.requireConfig();
    const fileName = sanitizeInstallerFileName(input.fileName);
    const objectKey = `${resolved.keyPrefix}/${input.platform}/${input.version}/${fileName}`;
    const contentLength = Number(input.fileSizeBytes ?? input.buffer.length);
    const command = new PutObjectCommand({
      Bucket: resolved.bucket,
      Key: objectKey,
      Body: input.buffer,
      ContentType: input.contentType,
      ContentLength: Number.isFinite(contentLength) ? contentLength : input.buffer.length,
    });
    await this.client(resolved).send(command);
    return {
      objectKey,
      publicUrl: this.publicUrl(resolved, objectKey),
    };
  }

  async presignUpload(input: PresignDesktopUploadDto) {
    const resolved = await this.requireConfig();
    const fileName = sanitizeInstallerFileName(input.fileName);
    const objectKey = `${resolved.keyPrefix}/${input.platform}/${input.version}/${fileName}`;
    const publicUrl = this.publicUrl(resolved, objectKey);
    if (!publicUrl) {
      throw new ServiceUnavailableException("Cloudflare R2 public download URL is not configured");
    }
    const command = new PutObjectCommand({
      Bucket: resolved.bucket,
      Key: objectKey,
      ContentType: input.contentType,
    });
    const uploadUrl = await getSignedUrl(this.client(resolved), command, {
      expiresIn: resolved.presignExpiresSeconds,
    });
    return {
      uploadUrl,
      objectKey,
      publicUrl,
      expiresAt: new Date(Date.now() + resolved.presignExpiresSeconds * 1000).toISOString(),
    };
  }

  async publicUrlForKey(objectKey: string) {
    const resolved = await this.requireConfig();
    return this.publicUrl(resolved, this.normalizeObjectKey(objectKey, resolved.keyPrefix));
  }

  async signedDownloadUrl(objectKey: string) {
    const resolved = await this.requireConfig();
    const key = this.normalizeObjectKey(objectKey, resolved.keyPrefix);
    const command = new GetObjectCommand({ Bucket: resolved.bucket, Key: key });
    return getSignedUrl(this.client(resolved), command, { expiresIn: resolved.presignExpiresSeconds });
  }

  private async resolveConfig(): Promise<ResolvedR2Config | null> {
    const row = await this.prisma.cloudR2Config.findUnique({ where: { name: DEFAULT_CONFIG_NAME } });
    if (row?.isActive) return this.decryptRow(row);

    const envConfig = this.envConfig();
    return this.missingKeys(envConfig).length === 0 ? envConfig : null;
  }

  private async requireConfig() {
    const resolved = await this.resolveConfig();
    if (!resolved || this.missingKeys(resolved).length > 0) {
      throw new ServiceUnavailableException("Cloudflare R2 installer storage is not configured");
    }
    if (resolved.accessKeyId === resolved.secretAccessKey) {
      throw new BadRequestException(
        "Cloudflare R2 access key secret is invalid: it is identical to access key id. Use the R2 Secret Access Key, not the API token or key id.",
      );
    }
    return resolved;
  }

  private decryptRow(row: {
    id: string;
    isActive: boolean;
    accountId: string | null;
    endpoint: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKeyEnc: string;
    publicBaseUrl: string | null;
    publicDevelopmentUrl: string | null;
    keyPrefix: string;
    presignExpiresSeconds: number;
  }): ResolvedR2Config {
    return {
      source: "DB",
      id: row.id,
      isActive: row.isActive,
      accountId: row.accountId ?? "",
      endpoint: row.endpoint,
      bucket: row.bucket,
      accessKeyId: row.accessKeyId,
      secretAccessKey: this.crypto.decrypt(row.secretAccessKeyEnc),
      publicBaseUrl: normalizeUrlBase(row.publicBaseUrl),
      publicDevelopmentUrl: normalizeUrlBase(row.publicDevelopmentUrl),
      keyPrefix: this.normalizePrefix(row.keyPrefix),
      presignExpiresSeconds: row.presignExpiresSeconds,
    };
  }

  private envConfig(): ResolvedR2Config {
    const accountId = this.env("CF_R2_ACCOUNT_ID", "CF_ACCOUNT_ID", "CF_Account_ID");
    const endpoint = this.env("CF_R2_ENDPOINT", "CF_S3_API") || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
    return {
      source: "ENV",
      isActive: true,
      accountId,
      endpoint,
      bucket: this.env("CF_R2_BUCKET", "CF_STORAGE_NAME"),
      accessKeyId: this.env("CF_R2_ACCESS_KEY_ID", "CF_ACCESS_KEY_ID"),
      secretAccessKey: this.env("CF_R2_SECRET_ACCESS_KEY", "CF_SECRET_ACCESS_KEY", "CF_ACCESS_KEY_SECRET"),
      publicBaseUrl: normalizeUrlBase(this.env("CF_R2_PUBLIC_BASE_URL", "CF_CUSTOM_DOMAIN")),
      publicDevelopmentUrl: normalizeUrlBase(this.env("CF_R2_PUBLIC_DEVELOPMENT_URL", "CF_PUBLIC_DEVELOPMENT_URL", "CF_Public_Development_URL")),
      keyPrefix: this.normalizePrefix(this.env("CF_R2_KEY_PREFIX") || DEFAULT_KEY_PREFIX),
      presignExpiresSeconds: Number(this.env("CF_R2_PRESIGN_EXPIRES_SECONDS") || DEFAULT_PRESIGN_EXPIRES_SECONDS),
    };
  }

  private client(config: ResolvedR2Config) {
    return new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  private publicUrl(config: ResolvedR2Config, objectKey: string) {
    const base = config.publicBaseUrl || config.publicDevelopmentUrl;
    return base ? `${base}/${objectKey.split("/").map(encodeURIComponent).join("/")}` : "";
  }

  private normalizeObjectKey(objectKey: string, keyPrefix: string) {
    const clean = objectKey.trim().replace(/^\/+/, "");
    if (!clean.startsWith(`${keyPrefix}/`) || clean.includes("..")) {
      throw new BadRequestException("Invalid R2 object key");
    }
    return clean;
  }

  private missingKeys(config: Pick<ResolvedR2Config, "endpoint" | "bucket" | "accessKeyId" | "secretAccessKey">) {
    return (["endpoint", "bucket", "accessKeyId", "secretAccessKey"] as const).filter((key) => !config[key]?.trim());
  }

  private normalizePrefix(value: string | null | undefined) {
    const prefix = value?.trim().replace(/^\/+|\/+$/g, "") || DEFAULT_KEY_PREFIX;
    if (prefix.includes("..")) throw new BadRequestException("Invalid R2 key prefix");
    return prefix;
  }

  private trim(value: string | null | undefined) {
    return value?.trim() || null;
  }

  private trimRequired(value: string, label: string) {
    const clean = value?.trim();
    if (!clean) throw new BadRequestException(`${label} is required`);
    return clean;
  }

  private env(...keys: string[]) {
    for (const key of keys) {
      const value = this.config.get<string>(key);
      if (value?.trim()) return value.trim();
    }
    return "";
  }
}
