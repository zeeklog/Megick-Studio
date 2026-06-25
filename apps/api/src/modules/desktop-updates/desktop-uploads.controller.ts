import { BadRequestException, Body, Controller, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Roles } from "@/common/decorators/roles.decorator";
import { CloudR2Service } from "../cloud-resources/cloud-r2.service";
import { PresignDesktopUploadDto } from "./desktop-updates.dto";

type UploadedInstallerFile = {
  buffer?: Buffer;
  mimetype?: string;
  originalname?: string;
  size?: number;
};

@Roles("SUPER_ADMIN")
@Controller("api/admin/desktop-updates/uploads")
export class DesktopUploadsController {
  constructor(private readonly r2: CloudR2Service) {}

  @Post("presign")
  presignUpload(@Body() body: PresignDesktopUploadDto) {
    return this.r2.presignUpload(body);
  }

  @Post()
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 1024 * 1024 * 1024 } }))
  async upload(@Body() body: PresignDesktopUploadDto, @UploadedFile() file: UploadedInstallerFile | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException("Installer file is required");
    const result = await this.r2.uploadInstaller({
      ...body,
      fileName: body.fileName || file.originalname || "installer",
      contentType: body.contentType || file.mimetype || "application/octet-stream",
      fileSizeBytes: file.size,
      buffer: file.buffer,
    });
    return {
      ...result,
      fileName: body.fileName || file.originalname || "installer",
      fileSizeBytes: file.size ?? file.buffer.length,
    };
  }
}
