process.env.MEGICK_RUN_WORKERS = process.env.MEGICK_RUN_WORKERS ?? "false";

import { getQueueToken } from "@nestjs/bullmq";
import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { Queue } from "bullmq";
import { PrismaService } from "nestjs-prisma";
import { PrismaModule } from "nestjs-prisma";
import { CommonModule } from "../src/common/common.module";
import { apiEnvFilePaths } from "../src/env-file-paths";
import { GENERATION_QUEUE } from "../src/modules/generation/generation.constants";
import { GenerationModule } from "../src/modules/generation/generation.module";
import { JobsService } from "../src/modules/generation/jobs.service";

type Args = {
  execute: boolean;
  jobIds: string[];
  sessionIds: string[];
  emails: string[];
};

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: apiEnvFilePaths(),
    }),
    PrismaModule.forRoot({
      isGlobal: true,
      prismaServiceOptions: { explicitConnect: false },
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>("REDIS_HOST", "127.0.0.1"),
          port: Number(config.get<string>("REDIS_PORT", "6379")),
          password: config.get<string>("REDIS_PASSWORD") || undefined,
          db: Number(config.get<string>("REDIS_DB", "0")),
        },
      }),
    }),
    CommonModule,
    GenerationModule,
  ],
})
class ReconcileText2ImageModule {}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    execute: false,
    jobIds: [],
    sessionIds: [],
    emails: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    const next = argv[index + 1];
    if (item === "--execute") {
      args.execute = true;
      continue;
    }
    if (item === "--job-id" && next) {
      args.jobIds.push(next);
      index += 1;
      continue;
    }
    if (item === "--session-id" && next) {
      args.sessionIds.push(next);
      index += 1;
      continue;
    }
    if (item === "--email" && next) {
      args.emails.push(next);
      index += 1;
      continue;
    }
    throw new Error(`Unknown or incomplete argument: ${item}`);
  }
  return args;
}

async function resolveJobIds(prisma: PrismaService, args: Args) {
  const ids = new Set(args.jobIds);
  if (args.sessionIds.length) {
    const jobs = await prisma.generationJob.findMany({
      where: {
        chatSessionId: { in: args.sessionIds },
        type: { in: ["TEXT2IMAGE", "IMAGE_EDIT"] },
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    jobs.forEach((job) => ids.add(job.id));
  }
  if (args.emails.length) {
    const jobs = await prisma.generationJob.findMany({
      where: {
        user: { email: { in: args.emails } },
        type: { in: ["TEXT2IMAGE", "IMAGE_EDIT"] },
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    jobs.forEach((job) => ids.add(job.id));
  }
  return [...ids];
}

async function removeFinishedQueueJob(queue: Queue, jobId: string) {
  const queueJob = await queue.getJob(jobId);
  if (!queueJob) return;
  const state = await queueJob.getState();
  if (state === "active") return;
  await queueJob.remove();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.jobIds.length && !args.sessionIds.length && !args.emails.length) {
    throw new Error(
      "Provide at least one --job-id, --session-id, or --email. Add --execute to write changes.",
    );
  }

  const app = await NestFactory.createApplicationContext(ReconcileText2ImageModule, {
    logger: ["error", "warn", "log"],
  });
  try {
    const prisma = app.get(PrismaService);
    const jobs = app.get(JobsService);
    const queue = app.get<Queue>(getQueueToken(GENERATION_QUEUE));
    const jobIds = await resolveJobIds(prisma, args);
    const results: unknown[] = [];
    for (const jobId of jobIds) {
      const result = await jobs.reconcileText2ImageJob(jobId, {
        execute: args.execute,
      });
      results.push(result);
      const action =
        typeof result === "object" && result && "action" in result
          ? String(result.action)
          : "";
      if (
        args.execute &&
        (action === "succeeded" || action === "failed")
      ) {
        await removeFinishedQueueJob(queue, jobId);
      }
    }
    process.stdout.write(`${JSON.stringify({ execute: args.execute, results }, null, 2)}\n`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  process.stderr.write(`${(err as Error).stack ?? (err as Error).message}\n`);
  process.exitCode = 1;
});
