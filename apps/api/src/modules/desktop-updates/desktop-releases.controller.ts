import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { Public } from "@/common/decorators/public.decorator";
import { Roles } from "@/common/decorators/roles.decorator";
import { DesktopReleasesService } from "./desktop-releases.service";
import {
  CreateDesktopReleaseDto,
  DesktopUpdateQueryDto,
  type DesktopPlatformValue,
  UpdateDesktopReleaseDto,
} from "./desktop-updates.dto";

@Controller()
export class DesktopReleasesController {
  constructor(private readonly releases: DesktopReleasesService) {}

  @Roles("SUPER_ADMIN")
  @Get("api/admin/desktop-updates/releases")
  list(@Query("platform") platform?: DesktopPlatformValue) {
    return this.releases.list(platform);
  }

  @Roles("SUPER_ADMIN")
  @Post("api/admin/desktop-updates/releases")
  create(@Body() body: CreateDesktopReleaseDto) {
    return this.releases.create(body);
  }

  @Roles("SUPER_ADMIN")
  @Patch("api/admin/desktop-updates/releases/:id")
  update(@Param("id") id: string, @Body() body: UpdateDesktopReleaseDto) {
    return this.releases.update(id, body);
  }

  @Roles("SUPER_ADMIN")
  @Delete("api/admin/desktop-updates/releases/:id")
  remove(@Param("id") id: string) {
    return this.releases.remove(id);
  }

  @Roles("SUPER_ADMIN")
  @Post("api/admin/desktop-updates/releases/:id/set-latest")
  setLatest(@Param("id") id: string) {
    return this.releases.setLatest(id);
  }

  @Public()
  @Get("api/desktop-updates/download")
  async download(@Query() query: DesktopUpdateQueryDto, @Res() res: Response) {
    const { url } = await this.releases.download(query.platform);
    res.redirect(302, url);
  }

  @Public()
  @Get("api/desktop-updates/latest")
  latest(@Query() query: DesktopUpdateQueryDto) {
    return this.releases.latest(query.platform);
  }

  @Public()
  @Get("api/desktop-updates/check")
  check(@Query() query: DesktopUpdateQueryDto) {
    return this.releases.check(query.platform, query.version ?? "0.0.0");
  }
}
