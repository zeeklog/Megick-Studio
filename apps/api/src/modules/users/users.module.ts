import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { SmtpModule } from "../smtp/smtp.module";
import { backgroundWorkersEnabled } from "../../runtime";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";
import { AdminUsersController } from "./admin-users.controller";
import { AdminCreditNotificationProcessor } from "./processors/admin-credit-notification.processor";
import { ADMIN_CREDIT_NOTIFICATIONS_QUEUE } from "./users.constants";

const processorProviders = backgroundWorkersEnabled()
  ? [AdminCreditNotificationProcessor]
  : [];

@Module({
  imports: [
    SmtpModule,
    BullModule.registerQueue({ name: ADMIN_CREDIT_NOTIFICATIONS_QUEUE }),
  ],
  controllers: [UsersController, AdminUsersController],
  providers: [UsersService, ...processorProviders],
  exports: [UsersService],
})
export class UsersModule {}
