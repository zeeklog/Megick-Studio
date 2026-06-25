import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { SmtpService } from "@/modules/smtp/smtp.service";
import { normalizeLocale } from "@/common/locale";
import {
  ADMIN_CREDIT_NOTIFICATION_JOB,
  ADMIN_CREDIT_NOTIFICATIONS_QUEUE,
  type CreditNotificationJobData,
} from "../users.constants";

@Processor(ADMIN_CREDIT_NOTIFICATIONS_QUEUE, {
  concurrency: 1,
  limiter: { max: 1, duration: 5_000 },
})
export class AdminCreditNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(AdminCreditNotificationProcessor.name);

  constructor(private readonly smtp: SmtpService) {
    super();
  }

  async process(job: Job<CreditNotificationJobData>) {
    if (job.name !== ADMIN_CREDIT_NOTIFICATION_JOB) return { skipped: true };

    await this.smtp.sendCreditAdjustmentNotification({
      to: job.data.email,
      displayName: job.data.displayName,
      delta: job.data.delta,
      balanceAfter: job.data.balanceAfter,
      reason: job.data.reason,
      locale: normalizeLocale(job.data.locale),
    });

    this.logger.log(`Sent credit notification email to user=${job.data.userId}`);
    return { sent: true };
  }
}
