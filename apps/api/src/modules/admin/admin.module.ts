import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminLoginController } from "./admin-login.controller";
import { AdminAuditService } from "./admin-audit.service";
import { AuthModule } from "../auth/auth.module";
import { SiteSettingsModule } from "../site-settings/site-settings.module";

@Module({
  imports: [AuthModule, SiteSettingsModule],
  controllers: [AdminController, AdminLoginController],
  providers: [AdminAuditService],
  exports: [AdminAuditService],
})
export class AdminModule {}
