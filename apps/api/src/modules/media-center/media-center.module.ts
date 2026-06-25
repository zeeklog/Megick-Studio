import { Module } from "@nestjs/common";
import { OssModule } from "../oss/oss.module";
import { MediaCenterController } from "./media-center.controller";
import { MediaCenterService } from "./media-center.service";

@Module({
  imports: [OssModule],
  controllers: [MediaCenterController],
  providers: [MediaCenterService],
})
export class MediaCenterModule {}
