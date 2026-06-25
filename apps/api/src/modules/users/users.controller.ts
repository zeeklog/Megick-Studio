import { Body, Controller, Get, Patch, Query } from "@nestjs/common";
import { ApiOperation, ApiProperty, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { CurrentUser, type AuthUserContext } from "@/common/decorators/current-user.decorator";
import { paginated, parsePagination, type PaginationQuery } from "@/common/pagination";
import { UsersService } from "./users.service";
import { PrismaService } from "nestjs-prisma";
import {
  ApiOkPaginatedResponse,
  ApiOkResponseModel,
  ApiPaginationQueries,
  ApiSessionCookieAuth,
  ApiValidationErrorResponse,
  CreditLedgerEntryDto,
  UserOverviewDto,
  UserRecordDto,
  UserProfileDto,
  documentedOperation,
} from "@/common/swagger/api-docs";

class UpdateProfileDto {
  @ApiProperty({
    description: "Display name shown in the dashboard header and other product surfaces.",
    required: false,
    example: "Neo",
  })
  @IsOptional() @IsString() @MaxLength(80) displayName?: string;
  @ApiProperty({
    description:
      "Preferred locale. Supported values are `en`, `zh-CN`, `zh-TW`, `ja`, `fr`, and `de`; omitted values keep the current profile locale.",
    required: false,
    example: "zh-CN",
  })
  @IsOptional() @IsString() locale?: string;
  @ApiProperty({
    description:
      "Avatar image URL returned by the Megick OSS upload flow. Clients should send `/api/oss/sign?key=...` or an avatar OSS key, not arbitrary remote URLs.",
    required: false,
    example: "/api/oss/sign?key=avatars/cmuser123/avatar.png",
  })
  @IsOptional() @IsString() @MaxLength(512) avatarUrl?: string;
}

@ApiTags("users")
@ApiSessionCookieAuth()
@ApiValidationErrorResponse()
@Controller("api/users")
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("me")
  @ApiOperation(
    documentedOperation(
      "Get current user",
      "Returns the current authenticated user record with nested profile and assigned roles. Clients should treat only documented fields as stable contract fields.",
    ),
  )
  @ApiOkResponseModel(UserRecordDto, "Current user loaded successfully.")
  me(@CurrentUser() user: AuthUserContext) {
    return this.users.getMe(user.id);
  }

  @Patch("me")
  @ApiOperation(
    documentedOperation(
      "Update current user profile",
      "Updates the current user's profile fields. Values omitted from the payload keep their previous values.",
    ),
  )
  @ApiOkResponseModel(UserProfileDto, "Profile updated successfully.")
  async updateMe(@CurrentUser() user: AuthUserContext, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @Get("me/overview")
  @ApiOperation(
    documentedOperation(
      "Dashboard overview",
      "Returns the compact account, credit, and generation summary used by the dashboard landing screens.",
    ),
  )
  @ApiOkResponseModel(UserOverviewDto, "Dashboard overview loaded successfully.")
  overview(@CurrentUser() user: AuthUserContext) {
    return this.users.overview(user.id);
  }

  @Get("me/credits/ledger")
  @ApiPaginationQueries({ defaultPageSize: 30, maxPageSize: 200 })
  @ApiOperation(
    documentedOperation(
      "Get credit ledger",
      "Returns the current user's credit ledger in reverse chronological order. Use this endpoint to build credit history screens or consumption logs.",
    ),
  )
  @ApiOkPaginatedResponse(
    CreditLedgerEntryDto,
    "Credit ledger page loaded successfully.",
  )
  async ledger(@CurrentUser() user: AuthUserContext, @Query() query: PaginationQuery) {
    const pagination = parsePagination(query, { defaultPageSize: 30, maxPageSize: 200 });
    const where = { userId: user.id };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.creditLedger.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.creditLedger.count({ where }),
    ]);
    return paginated(items, total, pagination);
  }
}
