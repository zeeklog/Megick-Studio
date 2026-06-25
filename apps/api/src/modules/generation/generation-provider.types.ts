export type GeneratedOutputPersistence = "project-oss";

export interface GeneratedItem {
  url?: string;
  fallbackUrl?: string;
  bytes?: Buffer;
  contentType?: string;
  persistence?: GeneratedOutputPersistence;
  requireOssPersistence?: boolean;
  providerFileId?: string;
  providerJobId?: string;
}

export interface VideoTaskResult {
  providerJobId: string;
  status?: string;
  items: GeneratedItem[];
  error?: string;
  raw?: unknown;
}

export interface VideoTaskListResult {
  items: VideoTaskResult[];
  total: number;
  raw?: unknown;
}

export interface VideoTaskDeleteResult {
  providerJobId: string;
  previousStatus?: string;
  action: "cancelled" | "deleted" | "unsupported" | "not_found";
  raw?: unknown;
}

export function providerUrlForItem(item: GeneratedItem) {
  return item.url ?? item.fallbackUrl;
}
