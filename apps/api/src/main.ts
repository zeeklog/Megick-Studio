import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pathToFileURL } from "node:url";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { Logger, ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import {
  json,
  raw,
  urlencoded,
  type NextFunction,
  type Request as ExpressRequest,
  type Response as ExpressResponse,
} from "express";
import { AppModule } from "./app.module";
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter";
import { OPENAPI_DESCRIPTION } from "./common/swagger/openapi-meta";

type TanStackServerEntry = {
  default?: {
    fetch?: (request: Request) => Promise<Response>;
  };
};

type NativeImport = <T>(specifier: string) => Promise<T>;

const nativeImport = new Function("specifier", "return import(specifier)") as NativeImport;

function envFlagEnabled(value: string | undefined) {
  if (!value) return null;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

function shouldEnableRequestLogging() {
  return envFlagEnabled(process.env.REQUEST_LOGGING_ENABLED) ?? process.env.NODE_ENV === "production";
}

function mountRequestLogger(app: NestExpressApplication) {
  app.use(
    pinoHttp<ExpressRequest, ExpressResponse>({
      name: "megick-http",
      level: process.env.LOG_LEVEL ?? "info",
      genReqId: (req, res) => {
        const header = req.headers["x-request-id"];
        const requestId = (Array.isArray(header) ? header[0] : header) || randomUUID();
        res.setHeader("x-request-id", requestId);
        return requestId;
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
      customSuccessMessage: (req, res, responseTime) =>
        `${req.method} ${req.url} ${res.statusCode} ${Math.round(responseTime)}ms`,
      customErrorMessage: (req, res, err) =>
        `${req.method} ${req.url} ${res.statusCode} ${err.message}`,
      wrapSerializers: false,
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url,
            remoteAddress: req.socket?.remoteAddress,
            userAgent: req.headers["user-agent"],
          };
        },
        res(res) {
          return {
            statusCode: res.statusCode,
          };
        },
      },
      customProps: (req) => ({
        ip: req.ip,
      }),
    }),
  );

  Logger.log("HTTP request logging enabled", "Bootstrap");
}

function resolveWebDistDir() {
  const configured = process.env.WEB_DIST_DIR ? resolve(process.env.WEB_DIST_DIR) : null;
  const candidates = [
    configured,
    resolve(process.cwd(), "apps/web/dist"),
    resolve(process.cwd(), "../web/dist"),
    resolve(__dirname, "../../web/dist"),
    resolve(__dirname, "../../../apps/web/dist"),
  ].filter((value): value is string => Boolean(value));

  return candidates.find(
    (dir) =>
      existsSync(join(dir, "client")) &&
      existsSync(join(dir, "server", "server.js")),
  );
}

function shouldSkipWebRequest(req: ExpressRequest) {
  const path = req.path || req.url.split("?")[0] || "/";

  if (path.startsWith("/api")) return true;
  if (path.startsWith("/assets/")) return true;
  if (path.startsWith("/_serverFn/")) return false;
  if (path.includes(".")) return true;
  if (req.method !== "GET" && req.method !== "HEAD") return true;

  const accept = req.headers.accept ?? "";
  return Boolean(accept) && !accept.includes("text/html") && !accept.includes("*/*");
}

function legacyStaticMediaTarget(path: string) {
  if (path.startsWith("/ai-tools/thumbs/")) return `/media${path}`;
  if (path.startsWith("/ai-tools/comparisons/")) return `/media${path}`;
  if (path === "/ai-tools/megick-ai-tools-sheet.png") return `/media${path}`;
  return null;
}

function toFetchRequest(req: ExpressRequest) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      value.forEach((item) => headers.append(key, item));
    } else if (value !== undefined) {
      headers.set(key, value);
    }
  }

  const protocol = req.protocol || (req.secure ? "https" : "http");
  const host = req.get("host") ?? "localhost";
  const url = `${protocol}://${host}${req.originalUrl ?? req.url}`;
  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = Readable.toWeb(req) as unknown as BodyInit;
    init.duplex = "half";
  }

  return new Request(url, init);
}

function writeFetchHeaders(response: Response, res: ExpressResponse) {
  const getSetCookie = response.headers.getSetCookie?.bind(response.headers);
  const setCookies = getSetCookie ? getSetCookie() : [];

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") {
      res.setHeader(key, value);
    }
  });

  if (setCookies.length) {
    res.setHeader("set-cookie", setCookies);
  }
}

function sendFetchResponse(response: Response, res: ExpressResponse, headOnly: boolean) {
  res.status(response.status);
  writeFetchHeaders(response, res);

  if (headOnly || !response.body) {
    res.end();
    return;
  }

  const body = Readable.fromWeb(response.body as unknown as NodeReadableStream<Uint8Array>);
  body.on("error", (err) => res.destroy(err));
  body.pipe(res);
}

async function mountWebFrontend(app: NestExpressApplication) {
  if (process.env.SERVE_WEB === "false") {
    Logger.log("Web frontend serving disabled by SERVE_WEB=false", "Bootstrap");
    return;
  }

  const distDir = resolveWebDistDir();
  if (!distDir) {
    const message =
      "Web build not found. Run `pnpm --filter @megick/web build` before starting production.";
    if (process.env.NODE_ENV === "production") throw new Error(message);
    Logger.warn(message, "Bootstrap");
    return;
  }

  const clientDir = join(distDir, "client");
  const serverEntry = join(distDir, "server", "server.js");
  const imported = await nativeImport<TanStackServerEntry>(pathToFileURL(serverEntry).href);
  const webServer = imported.default;
  if (!webServer?.fetch) {
    throw new Error(`TanStack Start server entry does not export a fetch handler: ${serverEntry}`);
  }

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use((req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
    const path = req.path || req.url.split("?")[0] || "/";
    const target = legacyStaticMediaTarget(path);
    if (!target) {
      next();
      return;
    }

    const originalUrl = req.originalUrl ?? req.url;
    const queryIndex = originalUrl.indexOf("?");
    res.redirect(308, queryIndex >= 0 ? `${target}${originalUrl.slice(queryIndex)}` : target);
  });

  app.useStaticAssets(clientDir, {
    index: false,
    fallthrough: true,
    redirect: false,
    maxAge: process.env.NODE_ENV === "production" ? "1y" : 0,
  });

  expressApp.use(async (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
    if (shouldSkipWebRequest(req)) {
      next();
      return;
    }

    try {
      const response = await webServer.fetch!(toFetchRequest(req));
      sendFetchResponse(response, res, req.method === "HEAD");
    } catch (err) {
      next(err);
    }
  });

  Logger.log(`Serving TanStack Start build from ${distDir}`, "Bootstrap");
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  app.flushLogs();

  app.enableShutdownHooks();

  app.set("trust proxy", true);
  if (shouldEnableRequestLogging()) {
    mountRequestLogger(app);
  }

  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cookieParser());
  app.use(json({ limit: "10mb" }));
  app.use(urlencoded({ extended: true, limit: "10mb" }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  // Allow same-origin behind Vite proxy / Nginx; avoid permissive CORS.
  app.enableCors({
    origin: (origin, cb) => cb(null, true),
    credentials: true,
  });

  // Swagger / OpenAPI
  if (process.env.SWAGGER_ENABLED !== "false") {
    const config = new DocumentBuilder()
      .setTitle("Megick")
      .setDescription(OPENAPI_DESCRIPTION)
      .setVersion("0.1.0")
      .addCookieAuth("mg_session", { type: "apiKey", in: "cookie", name: "mg_session" })
      .addServer(process.env.API_BASE_URL ?? "http://localhost:3333", "API base")
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup(process.env.SWAGGER_PATH ?? "/api/docs", app, document, {
      jsonDocumentUrl: "/api/docs.json",
    });
  }

  await mountWebFrontend(app);

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, "0.0.0.0");
  Logger.log(`Megick listening on http://localhost:${port}`, "Bootstrap");
  Logger.log(`Swagger: http://localhost:${port}${process.env.SWAGGER_PATH ?? "/api/docs"}`, "Bootstrap");
}

bootstrap();
