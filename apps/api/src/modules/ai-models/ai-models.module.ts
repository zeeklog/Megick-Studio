import { Module } from "@nestjs/common";
import { SiteSettingsModule } from "../site-settings/site-settings.module";
import { ModelProvidersModule } from "../model-providers/model-providers.module";
import { AiModelsService } from "./ai-models.service";
import { AiModelsController, AdminAiModelsController } from "./ai-models.controller";

@Module({
  imports: [SiteSettingsModule, ModelProvidersModule],
  controllers: [AiModelsController, AdminAiModelsController],
  providers: [AiModelsService],
  exports: [AiModelsService],
})
export class AiModelsModule {}
