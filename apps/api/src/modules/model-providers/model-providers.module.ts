import { Module } from "@nestjs/common";
import {
  ModelProvidersController,
  PublicModelProvidersController,
} from "./model-providers.controller";
import { ModelProvidersService } from "./model-providers.service";

@Module({
  controllers: [ModelProvidersController, PublicModelProvidersController],
  providers: [ModelProvidersService],
  exports: [ModelProvidersService],
})
export class ModelProvidersModule {}
