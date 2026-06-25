import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import IORedis, { type Redis } from "ioredis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private clients: Redis[] = [];
  private mainClient!: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.mainClient = this.create();
  }

  onModuleDestroy() {
    for (const c of this.clients) {
      c.disconnect();
    }
  }

  private create(): Redis {
    const client = new IORedis({
      host: this.config.get<string>("REDIS_HOST", "127.0.0.1"),
      port: Number(this.config.get<string>("REDIS_PORT", "6379")),
      password: this.config.get<string>("REDIS_PASSWORD") || undefined,
      db: Number(this.config.get<string>("REDIS_DB", "0")),
      lazyConnect: false,
      maxRetriesPerRequest: null,
    });
    this.clients.push(client);
    return client;
  }

  get client(): Redis {
    return this.mainClient;
  }
}
