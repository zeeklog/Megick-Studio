import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "nestjs-prisma";
import { CryptoService } from "@/common/services/crypto.service";
import {
  KEEP_EXISTING_SECRET,
  type UpsertCloudOssConfigDto,
  normalizeUrlBase,
} from "./cloud-resources.dto";

const DEFAULT_CONFIG_NAME = "default";

export interface ResolvedOssConfig {
  source: "DB" | "ENV";
  id?: string;
  isActive: boolean;
  region: string;
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
  domain: string;
  publicBaseUrl: string;
}

@Injectable()
export class CloudOssService {
  private readonly logger = new Logger(CloudOssService.name);
  private version = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService,
  ) {}

  getVersion() {
    return this.version;
  }

  async getAdminConfig() {
    const row = await this.prisma.ossConfig.findUnique({ where: { name: DEFAULT_CONFIG_NAME } });
    const resolved = await this.resolveConfig();
    if (row) {
      return {
        id: row.id,
        source: "DB" as const,
        isActive: row.isActive,
        region: row.region,
        endpoint: row.endpoint ?? "",
        bucket: row.bucket,
        accessKeyId: row.accessKeyId,
        accessKeySecret: row.accessKeySecretEnc ? KEEP_EXISTING_SECRET : "",
        hasAccessKeySecret: Boolean(row.accessKeySecretEnc),
        domain: row.domain ?? "",
        publicBaseUrl: row.publicBaseUrl ?? "",
        missingKeys: this.missingKeys(this.decryptRow(row)),
      };
    }

    return {
      source: resolved ? "ENV" : "EMPTY",
      isActive: resolved?.isActive ?? false,
      region: resolved?.region ?? "",
      endpoint: resolved?.endpoint ?? "",
      bucket: resolved?.bucket ?? "",
      accessKeyId: resolved?.accessKeyId ?? "",
      accessKeySecret: resolved?.accessKeySecret ? KEEP_EXISTING_SECRET : "",
      hasAccessKeySecret: Boolean(resolved?.accessKeySecret),
      domain: resolved?.domain ?? "",
      publicBaseUrl: resolved?.publicBaseUrl ?? "",
      missingKeys: resolved ? this.missingKeys(resolved) : ["region", "bucket", "accessKeyId", "accessKeySecret"],
    };
  }

  async upsertConfig(input: UpsertCloudOssConfigDto) {
    const existing = await this.prisma.ossConfig.findUnique({ where: { name: DEFAULT_CONFIG_NAME } });
    const previousSecret = existing ? this.crypto.decrypt(existing.accessKeySecretEnc) : "";
    const accessKeySecret = input.accessKeySecret === KEEP_EXISTING_SECRET ? previousSecret : input.accessKeySecret;
    if (!accessKeySecret) throw new BadRequestException("OSS access key secret is required");

    const row = await this.prisma.ossConfig.upsert({
      where: { name: DEFAULT_CONFIG_NAME },
      update: {
        region: this.trimRequired(input.region, "region"),
        endpoint: this.trim(input.endpoint),
        bucket: this.trimRequired(input.bucket, "bucket"),
        accessKeyId: this.trimRequired(input.accessKeyId, "accessKeyId"),
        accessKeySecretEnc: this.crypto.encrypt(accessKeySecret),
        domain: normalizeUrlBase(input.domain) || null,
        publicBaseUrl: normalizeUrlBase(input.publicBaseUrl) || null,
        isActive: input.isActive ?? true,
      },
      create: {
        name: DEFAULT_CONFIG_NAME,
        region: this.trimRequired(input.region, "region"),
        endpoint: this.trim(input.endpoint),
        bucket: this.trimRequired(input.bucket, "bucket"),
        accessKeyId: this.trimRequired(input.accessKeyId, "accessKeyId"),
        accessKeySecretEnc: this.crypto.encrypt(accessKeySecret),
        domain: normalizeUrlBase(input.domain) || null,
        publicBaseUrl: normalizeUrlBase(input.publicBaseUrl) || null,
        isActive: input.isActive ?? true,
      },
    });
    this.version += 1;

    return {
      id: row.id,
      source: "DB" as const,
      isActive: row.isActive,
      region: row.region,
      endpoint: row.endpoint ?? "",
      bucket: row.bucket,
      accessKeyId: row.accessKeyId,
      accessKeySecret: KEEP_EXISTING_SECRET,
      hasAccessKeySecret: true,
      domain: row.domain ?? "",
      publicBaseUrl: row.publicBaseUrl ?? "",
      missingKeys: this.missingKeys(this.decryptRow(row)),
    };
  }

  async testConfig() {
    const resolved = await this.resolveConfig();
    if (!resolved || this.missingKeys(resolved).length > 0) {
      throw new BadRequestException("OSS is not configured");
    }
    const mod = await import("ali-oss");
    const Ctor = (mod as unknown as { default?: unknown }).default ?? mod;
    const client = new (Ctor as any)(this.clientOptions(resolved));
    await client.list({ "max-keys": 1 });
    return { ok: true, bucket: resolved.bucket, source: resolved.source };
  }

  async resolveConfig(): Promise<ResolvedOssConfig | null> {
    const row = await this.prisma.ossConfig.findUnique({ where: { name: DEFAULT_CONFIG_NAME } });
    if (row?.isActive) return this.decryptRow(row);

    const envConfig = this.envConfig();
    return this.missingKeys(envConfig).length === 0 ? envConfig : null;
  }

  clientOptions(config: ResolvedOssConfig) {
    const opts: Record<string, unknown> = {
      region: config.region,
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      bucket: config.bucket,
      secure: true,
    };
    if (config.endpoint) opts.endpoint = config.endpoint;
    return opts;
  }

  publicBaseUrl(config: ResolvedOssConfig | null) {
    if (!config) return null;
    const domain = normalizeUrlBase(config.domain);
    if (domain) return domain;
    const publicBase = normalizeUrlBase(config.publicBaseUrl);
    if (publicBase) return publicBase;
    if (config.region && config.bucket) return `https://${config.bucket}.${config.region}.aliyuncs.com`;
    return null;
  }

  rewriteOssUrl(rawUrl: string, config: ResolvedOssConfig | null) {
    const domain = normalizeUrlBase(config?.domain);
    if (!domain) return rawUrl;

    if (config?.region && config.bucket) {
      const rawHost = `${config.bucket}.${config.region}.aliyuncs.com`;
      if (rawUrl.includes(rawHost)) {
        return rawUrl.replace(rawHost, domain.replace(/^https?:\/\//, ""));
      }
    }
    return rawUrl;
  }

  bucketName(config: ResolvedOssConfig | null) {
    return config?.bucket || this.config.get<string>("OSS_BUCKET", "local");
  }

  private decryptRow(row: {
    id: string;
    isActive: boolean;
    region: string;
    endpoint: string | null;
    bucket: string;
    accessKeyId: string;
    accessKeySecretEnc: string;
    domain: string | null;
    publicBaseUrl: string | null;
  }): ResolvedOssConfig {
    return {
      source: "DB",
      id: row.id,
      isActive: row.isActive,
      region: row.region,
      endpoint: row.endpoint ?? "",
      bucket: row.bucket,
      accessKeyId: row.accessKeyId,
      accessKeySecret: this.crypto.decrypt(row.accessKeySecretEnc),
      domain: normalizeUrlBase(row.domain),
      publicBaseUrl: normalizeUrlBase(row.publicBaseUrl),
    };
  }

  private envConfig(): ResolvedOssConfig {
    return {
      source: "ENV",
      isActive: true,
      region: this.env("OSS_REGION"),
      endpoint: this.env("OSS_ENDPOINT"),
      bucket: this.env("OSS_BUCKET"),
      accessKeyId: this.env("OSS_ACCESS_KEY_ID"),
      accessKeySecret: this.env("OSS_ACCESS_KEY_SECRET"),
      domain: normalizeUrlBase(this.env("OSS_DOMAIN")),
      publicBaseUrl: normalizeUrlBase(this.env("OSS_PUBLIC_BASE_URL")),
    };
  }

  private missingKeys(config: Pick<ResolvedOssConfig, "region" | "bucket" | "accessKeyId" | "accessKeySecret">) {
    return (["region", "bucket", "accessKeyId", "accessKeySecret"] as const).filter((key) => !config[key]?.trim());
  }

  private trim(value: string | null | undefined) {
    return value?.trim() || null;
  }

  private trimRequired(value: string, label: string) {
    const clean = value?.trim();
    if (!clean) throw new BadRequestException(`${label} is required`);
    return clean;
  }

  private env(key: string) {
    return this.config.get<string>(key)?.trim() || "";
  }
}
