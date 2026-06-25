import { Controller, Get, Logger } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import { Roles } from "@/common/decorators/roles.decorator";
import { GENERATION_QUEUE } from "./generation.constants";
import {
  ApiOkResponseModel,
  ApiSessionCookieAuth,
  QueueRecentResponseDto,
  QueueStatsDto,
  documentedOperation,
} from "@/common/swagger/api-docs";

@ApiTags("admin/queues")
@ApiSessionCookieAuth(
  "Requires a valid `mg_session` cookie for a SUPER_ADMIN account.",
)
@Roles("SUPER_ADMIN")
@Controller("api/admin/queues")
export class QueuesController {
  private readonly logger = new Logger(QueuesController.name);

  constructor(@InjectQueue(GENERATION_QUEUE) private readonly queue: Queue) {}

  @Get()
  @ApiOperation(
    documentedOperation(
      "Quick stats for the generation queue",
      "Returns a compact BullMQ queue summary for admin dashboards and health checks.",
    ),
  )
  @ApiOkResponseModel(
    QueueStatsDto,
    "Queue stats loaded successfully.",
  )
  async stats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);
    return { name: this.queue.name, waiting, active, completed, failed, delayed };
  }

  @Get("recent")
  @ApiOperation(
    documentedOperation(
      "Recent jobs in each state",
      "Returns the most recent waiting, active, failed, and completed BullMQ jobs with their raw queue payloads.",
    ),
  )
  @ApiOkResponseModel(
    QueueRecentResponseDto,
    "Recent queue jobs loaded successfully.",
  )
  async recent() {
    const [waiting, active, failed, completed] = await Promise.all([
      this.queue.getJobs(["waiting"], 0, 20, true),
      this.queue.getJobs(["active"], 0, 20, true),
      this.queue.getJobs(["failed"], 0, 20, false),
      this.queue.getJobs(["completed"], 0, 20, false),
    ]);
    const summarise = (job: { id?: string | null; name: string; data: unknown; failedReason?: string }) => ({
      id: job.id,
      name: job.name,
      data: job.data,
      failedReason: job.failedReason,
    });
    return {
      waiting: waiting.map(summarise),
      active: active.map(summarise),
      failed: failed.map(summarise),
      completed: completed.map(summarise),
    };
  }
}
