import { Body, Controller, Get, Post } from "@nestjs/common";
import { Roles } from "@/common/decorators/roles.decorator";
import { CloudOssService } from "./cloud-oss.service";
import { UpsertCloudOssConfigDto } from "./cloud-resources.dto";

@Roles("SUPER_ADMIN")
@Controller("api/admin/cloud-resources/oss-config")
export class CloudOssController {
  constructor(private readonly oss: CloudOssService) {}

  @Get()
  getConfig() {
    return this.oss.getAdminConfig();
  }

  @Post()
  upsertConfig(@Body() body: UpsertCloudOssConfigDto) {
    return this.oss.upsertConfig(body);
  }

  @Post("test")
  testConfig() {
    return this.oss.testConfig();
  }
}
