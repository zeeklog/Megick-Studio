export const ADMIN_CREDIT_NOTIFICATIONS_QUEUE = "admin-credit-notifications";
export const ADMIN_CREDIT_NOTIFICATION_JOB = "ADMIN_CREDIT_NOTIFICATION";

export interface CreditNotificationJobData {
  userId: string;
  email: string;
  displayName: string;
  delta: number;
  balanceAfter: number;
  reason: string;
  locale?: string;
}
