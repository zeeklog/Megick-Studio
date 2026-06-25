import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { AppModule } from "../src/app.module";
import { OPENAPI_DESCRIPTION } from "../src/common/swagger/openapi-meta";

async function main() {
  const app = await NestFactory.create(AppModule, { logger: ["error", "warn"] });
  const config = new DocumentBuilder()
    .setTitle("Megick")
    .setDescription(OPENAPI_DESCRIPTION)
    .setVersion("0.1.0")
    .addCookieAuth("mg_session")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  const target = join(process.cwd(), "dist", "openapi.json");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(document, null, 2));
  console.log(`✓ wrote ${target}`);
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
