import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ThrottlerModule } from "@nestjs/throttler";
import { BullModule } from "@nestjs/bullmq";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "nestjs-prisma";

import { CommonModule } from "./common/common.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { CreditsModule } from "./modules/credits/credits.module";
import { OssModule } from "./modules/oss/oss.module";
import { AiModelsModule } from "./modules/ai-models/ai-models.module";
import { ModelProvidersModule } from "./modules/model-providers/model-providers.module";
import { AiImageEditModesModule } from "./modules/ai-image-edit-modes/ai-image-edit-modes.module";
import { GenerationModule } from "./modules/generation/generation.module";
import { ChatsModule } from "./modules/chats/chats.module";
import { MediaCenterModule } from "./modules/media-center/media-center.module";
import { OAuthProvidersModule } from "./modules/oauth-providers/oauth-providers.module";
import { SmtpModule } from "./modules/smtp/smtp.module";
import { ShowcaseModule } from "./modules/showcase/showcase.module";
import { TemplatesModule } from "./modules/templates/templates.module";
import { NavigationMenusModule } from "./modules/navigation-menus/navigation-menus.module";
import { SiteSettingsModule } from "./modules/site-settings/site-settings.module";
import { CloudResourcesModule } from "./modules/cloud-resources/cloud-resources.module";
import { DesktopUpdatesModule } from "./modules/desktop-updates/desktop-updates.module";
import { RbacModule } from "./modules/rbac/rbac.module";
import { AdminModule } from "./modules/admin/admin.module";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { apiEnvFilePaths } from "./env-file-paths";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: apiEnvFilePaths(),
    }),

    PrismaModule.forRoot({ isGlobal: true, prismaServiceOptions: { explicitConnect: false } }),

    EventEmitterModule.forRoot({ wildcard: true }),

    ScheduleModule.forRoot(),

    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }]),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>("REDIS_HOST", "127.0.0.1"),
          port: Number(config.get<string>("REDIS_PORT", "6379")),
          password: config.get<string>("REDIS_PASSWORD") || undefined,
          db: Number(config.get<string>("REDIS_DB", "0")),
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5_000 },
          removeOnComplete: { age: 7 * 24 * 3600, count: 5_000 },
          removeOnFail: { age: 30 * 24 * 3600, count: 10_000 },
        },
      }),
    }),

    CommonModule,
    AuthModule,
    UsersModule,
    CreditsModule,
    OssModule,
    ModelProvidersModule,
    AiModelsModule,
    AiImageEditModesModule,
    GenerationModule,
    ChatsModule,
    MediaCenterModule,
    OAuthProvidersModule,
    SmtpModule,
    ShowcaseModule,
    TemplatesModule,
    NavigationMenusModule,
    SiteSettingsModule,
    CloudResourcesModule,
    DesktopUpdatesModule,
    RbacModule,
    AdminModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
