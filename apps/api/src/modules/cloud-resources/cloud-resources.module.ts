import { Module } from "@nestjs/common";
import { CloudOssController } from "./cloud-oss.controller";
import { CloudOssService } from "./cloud-oss.service";
import { CloudR2Controller } from "./cloud-r2.controller";
import { CloudR2Service } from "./cloud-r2.service";

@Module({
  controllers: [CloudR2Controller, CloudOssController],
  providers: [CloudR2Service, CloudOssService],
  exports: [CloudR2Service, CloudOssService],
})
export class CloudResourcesModule {}
