import { Module } from "@nestjs/common";
import { OssModule } from "../oss/oss.module";
import { GenerationOutputMediaModule } from "../generation-output-media/generation-output-media.module";
import { ChatsService } from "./chats.service";
import { AdminChatsController, ChatsController } from "./chats.controller";

@Module({
  imports: [OssModule, GenerationOutputMediaModule],
  controllers: [ChatsController, AdminChatsController],
  providers: [ChatsService],
  exports: [ChatsService],
})
export class ChatsModule {}
