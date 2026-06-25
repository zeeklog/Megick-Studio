import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiProperty, ApiQuery, ApiTags } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
} from "class-validator";
import { Roles } from "@/common/decorators/roles.decorator";
import { CurrentUser, type AuthUserContext } from "@/common/decorators/current-user.decorator";
import {
  paginated,
  parsePagination,
  type PaginationQuery,
} from "@/common/pagination";
import { UsersService } from "./users.service";
import {
  AdminUserDashboardDto,
  AdminUserRowDto,
  ApiOkPaginatedResponse,
  ApiOkResponseModel,
  ApiPaginationQueries,
  ApiSessionCookieAuth,
  ApiValidationErrorResponse,
  documentedOperation,
} from "@/common/swagger/api-docs";

class CreditAdjustmentDto {
  @ApiProperty({
    description:
      "Signed credit delta to apply. Positive values grant credits; negative values reduce the balance, but the backend never lets the stored balance fall below zero.",
    example: 100,
  })
  @IsInt() delta!: number;
  @ApiProperty({
    description: "Admin-visible reason stored in the credit ledger.",
    example: "Manual compensation",
  })
  @IsString() reason!: string;

  @ApiProperty({
    description:
      "When true, queue a user email notification after the credit adjustment succeeds. Notification jobs are processed serially with a 5-second interval.",
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  notifyUser?: boolean;
}

class BulkCreditAdjustmentDto extends CreditAdjustmentDto {
  @ApiProperty({
    description: "Target user IDs. At most 200 users can be adjusted in one request.",
    example: ["cmuser123", "cmuser456"],
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  userIds!: string[];
}

class StatusDto {
  @ApiProperty({
    description: "New account status enforced by the global auth guard.",
    enum: ["ACTIVE", "DISABLED", "PENDING"],
    example: "DISABLED",
  })
  @IsString() status!: "ACTIVE" | "DISABLED" | "PENDING";
}

interface AdminUsersQuery extends PaginationQuery {
  q?: string;
  status?: "ACTIVE" | "DISABLED" | "PENDING";
  creditSort?: "asc" | "desc";
}

class UserRecordStatusResponseDto {
  @ApiProperty({ description: "User ID.", example: "cmuser123" })
  id!: string;

  @ApiProperty({ description: "Login email.", example: "creator@example.com" })
  email!: string;

  @ApiProperty({
    description: "Updated account status.",
    enum: ["ACTIVE", "DISABLED", "PENDING"],
    example: "DISABLED",
  })
  status!: string;

  @ApiProperty({
    description: "Creation timestamp.",
    format: "date-time",
    example: "2026-05-15T08:00:00.000Z",
  })
  createdAt!: string;

  @ApiProperty({
    description: "Last update timestamp.",
    format: "date-time",
    example: "2026-05-15T08:00:00.000Z",
  })
  updatedAt!: string;
}

class AdminCreditBalanceDto {
  @ApiProperty({
    description: "New credit balance after the adjustment is applied.",
    example: 220,
  })
  credits!: number;

  @ApiProperty({
    description: "Whether a credit adjustment email notification job was queued.",
    example: true,
  })
  notificationQueued!: boolean;
}

class AdminBulkCreditAdjustmentResponseDto {
  @ApiProperty({ description: "Number of adjusted users.", example: 25 })
  adjusted!: number;

  @ApiProperty({
    description: "Whether user email notification jobs were queued.",
    example: true,
  })
  notificationQueued!: boolean;

  @ApiProperty({
    description: "Number of notification emails queued for serial delivery.",
    example: 25,
  })
  notificationCount!: number;
}

@ApiTags("admin/users")
@ApiSessionCookieAuth(
  "Requires a valid `mg_session` cookie for a SUPER_ADMIN account.",
)
@ApiValidationErrorResponse()
@Roles("SUPER_ADMIN")
@Controller("api/admin/users")
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiPaginationQueries({ defaultPageSize: 25, maxPageSize: 200 })
  @ApiQuery({
    name: "q",
    required: false,
    description:
      "Optional fuzzy search across user email and display name.",
    example: "neo",
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["ACTIVE", "DISABLED", "PENDING"],
    description: "Optional account status filter.",
  })
  @ApiQuery({
    name: "creditSort",
    required: false,
    enum: ["asc", "desc"],
    description: "Optional sort by current credit balance.",
  })
  @ApiOperation(
    documentedOperation(
      "List users",
      "Returns a paginated admin view of users with profile summary and assigned roles. Use `q` to search by email or display name.",
    ),
  )
  @ApiOkPaginatedResponse(AdminUserRowDto, "User page loaded successfully.")
  async list(@Query() query: AdminUsersQuery) {
    const pagination = parsePagination(query, {
      defaultPageSize: 25,
      maxPageSize: 200,
    });
    const { items, total } = await this.users.listAdmin({
      skip: pagination.skip,
      take: pagination.take,
      q: query.q,
      status: query.status,
      creditSort:
        query.creditSort === "asc" || query.creditSort === "desc"
          ? query.creditSort
          : undefined,
    });
    return paginated(items, total, pagination);
  }

  @Get(":id/dashboard")
  @ApiParam({
    name: "id",
    description: "Target user ID.",
    example: "cmuser123",
  })
  @ApiOperation(
    documentedOperation(
      "Get dashboard-style user metrics",
      "Returns a consolidated admin view of the user's profile, credits, generation activity, and related counts.",
    ),
  )
  @ApiOkResponseModel(
    AdminUserDashboardDto,
    "User dashboard metrics loaded successfully.",
  )
  dashboard(@Param("id") id: string) {
    return this.users.adminDashboard(id);
  }

  @Patch(":id/status")
  @ApiParam({
    name: "id",
    description: "Target user ID.",
    example: "cmuser123",
  })
  @ApiOperation(
    documentedOperation(
      "Set user status",
      "Updates the account status enforced by the global auth guard. `DISABLED` users can no longer authenticate successfully.",
    ),
  )
  @ApiOkResponseModel(UserRecordStatusResponseDto, "User status updated successfully.")
  status(@Param("id") id: string, @Body() dto: StatusDto) {
    return this.users.setStatus(id, dto.status);
  }

  @Post(":id/credits/adjust")
  @ApiParam({
    name: "id",
    description: "Target user ID.",
    example: "cmuser123",
  })
  @ApiOperation(
    documentedOperation(
      "Manually grant or remove credits",
      "Applies an admin credit adjustment and writes a ledger entry with the provided reason. The returned balance reflects the new stored total after clamping at zero.",
    ),
  )
  @ApiOkResponseModel(AdminCreditBalanceDto, "Credit balance adjusted successfully.")
  adjust(@Param("id") id: string, @Body() dto: CreditAdjustmentDto, @CurrentUser() admin: AuthUserContext) {
    return this.users.adjustCredits(id, dto.delta, dto.reason, admin.id, dto.notifyUser ?? false);
  }

  @Post("credits/adjust-bulk")
  @ApiOperation(
    documentedOperation(
      "Bulk grant or remove credits",
      "Applies the same admin credit adjustment to multiple users and optionally queues one email per user. Notification jobs are processed serially with a 5-second interval.",
    ),
  )
  @ApiOkResponseModel(AdminBulkCreditAdjustmentResponseDto, "Bulk credit adjustment completed successfully.")
  adjustBulk(@Body() dto: BulkCreditAdjustmentDto, @CurrentUser() admin: AuthUserContext) {
    return this.users.adjustCreditsMany(
      dto.userIds,
      dto.delta,
      dto.reason,
      admin.id,
      dto.notifyUser ?? false,
    );
  }
}
