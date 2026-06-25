import { Module } from "@nestjs/common";
import { CloudResourcesModule } from "../cloud-resources/cloud-resources.module";
import { OssService } from "./oss.service";
import { OssController } from "./oss.controller";

@Module({
  imports: [CloudResourcesModule],
  providers: [OssService],
  controllers: [OssController],
  exports: [OssService],
})
export class OssModule {}
