import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { CreditsModule } from "../credits/credits.module";
import { OssModule } from "../oss/oss.module";
import { AiModelsModule } from "../ai-models/ai-models.module";
import { AiImageEditModesModule } from "../ai-image-edit-modes/ai-image-edit-modes.module";
import { ModelProvidersModule } from "../model-providers/model-providers.module";
import { SiteSettingsModule } from "../site-settings/site-settings.module";
import { JobsService } from "./jobs.service";
import { JobsController } from "./jobs.controller";
import { JobsAdminController } from "./jobs-admin.controller";
import { Text2ImageProcessor } from "./processors/text2image.processor";
import { Image2VideoProcessor } from "./processors/image2video.processor";
import { GenerationProviderClient } from "./generation-provider.client";
import { GenerationOutputMediaModule } from "../generation-output-media/generation-output-media.module";
import { QueuesController } from "./queues.controller";
import { GENERATION_QUEUE } from "./generation.constants";
import { backgroundWorkersEnabled } from "../../runtime";

const processorProviders = backgroundWorkersEnabled()
  ? [Text2ImageProcessor, Image2VideoProcessor]
  : [];

@Module({
  imports: [
    CreditsModule,
    OssModule,
    AiModelsModule,
    AiImageEditModesModule,
    ModelProvidersModule,
    SiteSettingsModule,
    GenerationOutputMediaModule,
    BullModule.registerQueue({ name: GENERATION_QUEUE }),
  ],
  controllers: [JobsController, JobsAdminController, QueuesController],
  providers: [JobsService, GenerationProviderClient, ...processorProviders],
  exports: [JobsService],
})
export class GenerationModule {}
