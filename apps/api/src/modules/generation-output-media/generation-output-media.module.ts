import { Module } from "@nestjs/common";
import { OssModule } from "../oss/oss.module";
import { GenerationOutputMediaService } from "./generation-output-media.service";

@Module({
  imports: [OssModule],
  providers: [GenerationOutputMediaService],
  exports: [GenerationOutputMediaService],
})
export class GenerationOutputMediaModule {}
