import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import { RedisService } from "./redis.service";
import { randomId } from "../random-id";

export interface SessionPayload {
  jti: string;
  userId: string;
  isSuperAdmin: boolean;
}

const COOKIE_NAME_DEFAULT = "mg_session";

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  private get secret(): Uint8Array {
    const raw = this.config.get<string>("SESSION_SECRET") ?? "dev-insecure-session-secret-change-me";
    return new TextEncoder().encode(raw);
  }

  private get ttlSeconds(): number {
    return Number(this.config.get<string>("SESSION_TTL_SECONDS", "2592000"));
  }

  private get cookieName(): string {
    return this.config.get<string>("SESSION_COOKIE_NAME", COOKIE_NAME_DEFAULT);
  }

  private get cookieDomain(): string | undefined {
    return this.config.get<string>("SESSION_COOKIE_DOMAIN") || undefined;
  }

  private redisKey(jti: string): string {
    return `mg:session:${jti}`;
  }

  async issue(res: Response, payload: Omit<SessionPayload, "jti">): Promise<string> {
    const jti = randomId(32);
    const ttl = this.ttlSeconds;

    const token = await new SignJWT({ ...payload, jti })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setJti(jti)
      .setExpirationTime(`${ttl}s`)
      .sign(this.secret);

    await this.redis.client.set(
      this.redisKey(jti),
      JSON.stringify({ userId: payload.userId, isSuperAdmin: payload.isSuperAdmin }),
      "EX",
      ttl,
    );

    res.cookie(this.cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      domain: this.cookieDomain,
      maxAge: ttl * 1000,
      path: "/",
    });

    return token;
  }

  async verify(token: string): Promise<SessionPayload | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret);
      const jti = payload.jti as string | undefined;
      if (!jti) return null;
      const cached = await this.redis.client.get(this.redisKey(jti));
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      return {
        jti,
        userId: parsed.userId,
        isSuperAdmin: !!parsed.isSuperAdmin,
      };
    } catch (err) {
      this.logger.debug(`Session verify failed: ${(err as Error).message}`);
      return null;
    }
  }

  async revoke(jti: string) {
    await this.redis.client.del(this.redisKey(jti));
  }

  clearCookie(res: Response) {
    res.clearCookie(this.cookieName, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      domain: this.cookieDomain,
      path: "/",
    });
  }

  cookieKey(): string {
    return this.cookieName;
  }
}
