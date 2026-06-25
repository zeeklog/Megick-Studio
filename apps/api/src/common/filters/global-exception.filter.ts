import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Request, Response } from "express";

function exceptionBodyMessage(body: unknown) {
  if (typeof body === "string") return body;
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message?: unknown }).message;
    return Array.isArray(message) ? message.join("; ") : String(message);
  }
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const logMessage = `HTTP ${status} on ${req.method} ${req.originalUrl}: ${exceptionBodyMessage(body)}`;
      if (status >= 500) {
        this.logger.error(logMessage, exception.stack);
      } else {
        this.logger.warn(logMessage);
      }
      res.status(status).json(typeof body === "string" ? { message: body } : body);
      return;
    }

    this.logger.error(
      `Unhandled error on ${req.method} ${req.originalUrl}: ${(exception as Error)?.stack ?? exception}`,
    );
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      message: "Internal Server Error",
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  }
}
