import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiOperation, ApiProperty, ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsEmail, IsInt, IsOptional, IsString, Min } from "class-validator";
import { Roles } from "@/common/decorators/roles.decorator";
import {
  ApiOkResponseModel,
  ApiSessionCookieAuth,
  ApiValidationErrorResponse,
  OkResponseDto,
  SmtpConfigSummaryDto,
  documentedOperation,
} from "@/common/swagger/api-docs";
import { SmtpService } from "./smtp.service";

class UpsertSmtpDto {
  @ApiProperty({ description: "SMTP host.", example: "smtp.gmail.com" })
  @IsString() host!: string;

  @ApiProperty({ description: "SMTP port.", example: 587 })
  @IsInt()
  @Min(1)
  port!: number;

  @ApiProperty({ description: "Use implicit TLS. Gmail commonly uses false for port 587.", example: false })
  @IsBoolean() secure!: boolean;

  @ApiProperty({ description: "SMTP username, often the Gmail address.", example: "you@gmail.com" })
  @IsString() username!: string;

  @ApiProperty({
    description: "SMTP password or app password. Send __KEEP_EXISTING__ to keep the stored secret.",
    example: "__KEEP_EXISTING__",
  })
  @IsString() password!: string;

  @ApiProperty({ description: "Sender email address.", example: "you@gmail.com" })
  @IsEmail() fromEmail!: string;

  @ApiProperty({ description: "Sender display name.", required: false, example: "Megick" })
  @IsOptional() @IsString() fromName?: string;

  @ApiProperty({ description: "Optional reply-to email address.", required: false, example: "support@example.com" })
  @IsOptional() @IsString() replyTo?: string;

  @ApiProperty({ description: "Request STARTTLS on non-secure connections.", required: false, example: true })
  @IsOptional() @IsBoolean() requireTls?: boolean;

  @ApiProperty({ description: "Reject invalid TLS certificates.", required: false, example: true })
  @IsOptional() @IsBoolean() rejectUnauthorized?: boolean;

  @ApiProperty({ description: "Whether SMTP sending should be enabled.", required: false, example: true })
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class TestSmtpDto {
  @ApiProperty({ description: "Recipient email for the test message.", example: "admin@example.com" })
  @IsEmail() to!: string;
}

@ApiTags("admin/smtp")
@ApiSessionCookieAuth(
  "Requires a valid `mg_session` cookie for a SUPER_ADMIN account.",
)
@ApiValidationErrorResponse()
@Roles("SUPER_ADMIN")
@Controller("api/admin/smtp")
export class SmtpController {
  constructor(private readonly smtp: SmtpService) {}

  @Get()
  @ApiOperation(
    documentedOperation(
      "Get masked SMTP configuration",
      "Returns the admin SMTP readiness state and a masked configuration object. The password is never returned.",
    ),
  )
  @ApiOkResponseModel(
    SmtpConfigSummaryDto,
    "SMTP configuration loaded successfully.",
  )
  get() {
    return this.smtp.getSummary();
  }

  @Post()
  @ApiOperation(
    documentedOperation(
      "Create or update SMTP configuration",
      "Saves the SMTP configuration used for registration email verification. Secret values can be sent as `__KEEP_EXISTING__` to preserve the previous password.",
    ),
  )
  @ApiOkResponseModel(
    SmtpConfigSummaryDto,
    "SMTP configuration saved successfully.",
  )
  upsert(@Body() dto: UpsertSmtpDto) {
    return this.smtp.upsert(dto, dto.isActive ?? false);
  }

  @Post("test")
  @ApiOperation(
    documentedOperation(
      "Send an SMTP test email",
      "Sends a short test email using the currently active SMTP configuration.",
    ),
  )
  @ApiOkResponseModel(
    OkResponseDto,
    "SMTP test email sent successfully.",
  )
  test(@Body() dto: TestSmtpDto) {
    return this.smtp.sendTestEmail(dto.to);
  }
}
