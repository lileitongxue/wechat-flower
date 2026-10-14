import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * 全局异常过滤器：
 * - HttpException 原样返回
 * - 其他 Error 视为业务错误，转为 400 并携带 error.message（便于前端提示）
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      response.status(status).json(
        typeof res === 'string'
          ? { status: 'error', message: res, path: request.url }
          : { ...(res as object), path: request.url },
      );
      return;
    }

    const err = exception as Error;
    console.error(`[Unhandled] ${request.method} ${request.url}:`, err?.stack || err);
    response.status(HttpStatus.BAD_REQUEST).json({
      status: 'error',
      message: err?.message || '服务器内部错误',
      path: request.url,
    });
  }
}
