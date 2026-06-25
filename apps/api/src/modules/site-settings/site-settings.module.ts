import { Module } from "@nestjs/common";
import { SiteSettingsService } from "./site-settings.service";
import { SiteSettingsController, AdminSiteSettingsController } from "./site-settings.controller";

@Module({
  controllers: [SiteSettingsController, AdminSiteSettingsController],
  providers: [SiteSettingsService],
  exports: [SiteSettingsService],
})
export class SiteSettingsModule {}
