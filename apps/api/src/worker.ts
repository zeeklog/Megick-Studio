import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrapWorker() {
  process.env.MEGICK_RUN_WORKERS = process.env.MEGICK_RUN_WORKERS ?? "true";
  process.env.SERVE_WEB = process.env.SERVE_WEB ?? "false";

  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  app.flushLogs();
  app.enableShutdownHooks();

  Logger.log("Megick worker listening for background jobs", "WorkerBootstrap");
}

bootstrapWorker().catch((err) => {
  Logger.error((err as Error)?.stack ?? err, "WorkerBootstrap");
  process.exit(1);
});
