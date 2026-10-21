import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const feedback = typeof exceptionResponse === 'object' ? (exceptionResponse as any).feedback : undefined;
      // Machine-readable conflict code and structured details (e.g. the price import apply 409s).
      const code = typeof exceptionResponse === 'object' ? (exceptionResponse as any).code : undefined;
      const details = typeof exceptionResponse === 'object' ? (exceptionResponse as any).details : undefined;

      response.status(status).json({
        statusCode: status,
        timestamp: new Date().toISOString(),
        path: request.url,
        message: typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as any).message || 'Error',
        // User-facing hints (e.g. password policy); only plain string lists are forwarded.
        ...(Array.isArray(feedback) && feedback.every((f) => typeof f === 'string') ? { feedback } : {}),
        ...(typeof code === 'string' ? { code } : {}),
        ...(details !== null && typeof details === 'object' ? { details } : {}),
      });
    } else {
      const message = exception instanceof Error ? exception.message : 'Error interno del servidor';
      console.error(`[UnhandledError] ${request.method} ${request.url}:`, exception);

      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        timestamp: new Date().toISOString(),
        path: request.url,
        message,
      });
    }
  }
}
