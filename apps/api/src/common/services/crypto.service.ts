import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "node:crypto";

const FORMAT_VERSION = "v1";

/**
 * Symmetric encryption helper for third-party secrets stored in the database
 * (OAuth client secrets, AI API keys, and provider secrets).
 *
 * Format: `enc:v1:{base64-iv}:{base64-tag}:{base64-ciphertext}`
 */
@Injectable()
export class CryptoService implements OnModuleInit {
  private readonly logger = new Logger(CryptoService.name);
  private key: Buffer | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const raw = this.config.get<string>("APP_ENCRYPTION_KEY");
    if (!raw) {
      this.logger.warn(
        "APP_ENCRYPTION_KEY missing - secrets will be stored in plaintext (DEV ONLY).",
      );
      return;
    }
    const buf = Buffer.from(raw, "base64");
    if (buf.length < 32) {
      this.logger.error(
        `APP_ENCRYPTION_KEY must decode to 32 bytes; got ${buf.length}. Falling back to plaintext.`,
      );
      return;
    }
    this.key = buf.subarray(0, 32);
  }

  encrypt(plaintext: string): string {
    if (!plaintext) return "";
    if (!this.key) return `plain:${plaintext}`;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:${FORMAT_VERSION}:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
  }

  decrypt(payload: string | null | undefined): string {
    if (!payload) return "";
    if (payload.startsWith("plain:")) return payload.slice("plain:".length);
    if (!payload.startsWith("enc:")) return payload;
    if (!this.key) {
      this.logger.warn("Encrypted secret found but no APP_ENCRYPTION_KEY configured.");
      return "";
    }
    const parts = payload.split(":");
    if (parts.length !== 5 || parts[1] !== FORMAT_VERSION) {
      this.logger.warn(`Unsupported secret payload format: ${parts.slice(0, 2).join(":")}`);
      return "";
    }
    try {
      const [, , ivB64, tagB64, ctB64] = parts;
      const iv = Buffer.from(ivB64, "base64");
      const tag = Buffer.from(tagB64, "base64");
      const ct = Buffer.from(ctB64, "base64");
      const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
      return plain.toString("utf8");
    } catch (err) {
      this.logger.error(`Failed to decrypt secret: ${(err as Error).message}`);
      return "";
    }
  }

  randomToken(bytes = 32): string {
    return crypto.randomBytes(bytes).toString("base64url");
  }

  hashShort(input: string): string {
    return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
  }
}
