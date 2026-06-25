import { Controller, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Roles } from "@/common/decorators/roles.decorator";
import {
  paginated,
  parsePagination,
  type PaginationQuery,
} from "@/common/pagination";
import { JobsService } from "./jobs.service";
import {
  ApiOkPaginatedResponse,
  ApiPaginationQueries,
  ApiSessionCookieAuth,
  GenerationJobAdminListDto,
  documentedOperation,
} from "@/common/swagger/api-docs";

interface AdminJobsQuery extends PaginationQuery {
  q?: string;
  model?: string;
  status?: string;
}

interface UpstreamVideoTasksQuery {
  model?: string;
  pageNum?: string;
  pageSize?: string;
  status?: string;
  taskId?: string | string[];
}

@ApiTags("admin/generation")
@ApiSessionCookieAuth(
  "Requires a valid `mg_session` cookie for a SUPER_ADMIN account.",
)
@Roles("SUPER_ADMIN")
@Controller("api/admin/generation/jobs")
export class JobsAdminController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  @ApiPaginationQueries({ defaultPageSize: 50, maxPageSize: 200 })
  @ApiQuery({
    name: "q",
    required: false,
    description:
      "Optional fuzzy search across user ID, email, display name, and prompt text.",
    example: "neo",
  })
  @ApiQuery({
    name: "model",
    required: false,
    description: "Optional model code filter.",
    example: "dpi-flux-pro",
  })
  @ApiQuery({
    name: "status",
    required: false,
    description: "Optional job status filter.",
    example: "failed",
  })
  @ApiOperation(
    documentedOperation(
      "List all generation jobs",
      "Returns a paginated admin view of generation jobs with nested user context for support and operations tooling.",
    ),
  )
  @ApiOkPaginatedResponse(
    GenerationJobAdminListDto,
    "Admin generation jobs loaded successfully.",
  )
  async list(@Query() query: AdminJobsQuery) {
    const pagination = parsePagination(query, {
      defaultPageSize: 50,
      maxPageSize: 200,
    });
    const { items, total } = await this.jobs.listAdmin({
      skip: pagination.skip,
      take: pagination.take,
      q: query.q,
      modelCode: query.model,
      status: query.status,
    });
    return paginated(items, total, pagination);
  }

  @Get("upstream/video")
  @ApiQuery({
    name: "model",
    required: false,
    description:
      "Local AI model code whose provider/model snapshot should be used to query upstream video tasks.",
    example: "volc-seedance-2-0-t2v",
  })
  @ApiQuery({
    name: "status",
    required: false,
    description: "Optional upstream status filter for Volcengine tasks.",
    example: "queued",
  })
  @ApiQuery({
    name: "taskId",
    required: false,
    isArray: true,
    description:
      "Optional upstream task ID filter. Repeat the parameter to query multiple task IDs.",
  })
  @ApiOperation(
    documentedOperation(
      "List upstream video generation tasks",
      "Queries the configured Volcengine video task list endpoint for backend operations and reconciliation.",
    ),
  )
  upstreamVideoTasks(@Query() query: UpstreamVideoTasksQuery) {
    const taskIds = Array.isArray(query.taskId)
      ? query.taskId
      : query.taskId
        ? [query.taskId]
        : undefined;
    return this.jobs.listUpstreamVideoTasks({
      modelCode: query.model,
      status: query.status,
      pageNum: Number(query.pageNum) || 1,
      pageSize: Number(query.pageSize) || 20,
      taskIds,
    });
  }
}
