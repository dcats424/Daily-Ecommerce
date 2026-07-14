import { HttpException, HttpStatus } from '@nestjs/common';

class ApiError extends HttpException {
  constructor(statusCode: number, message: string, options?: { code?: string }) {
    super({ statusCode, message, code: options?.code }, statusCode);
  }

  static BadRequest(message: string, code?: string) {
    return new ApiError(HttpStatus.BAD_REQUEST, message, { code });
  }
  static Unauthorized(message = 'Unauthorized', code?: string) {
    return new ApiError(HttpStatus.UNAUTHORIZED, message, { code });
  }
  static Forbidden(message = 'Forbidden', code?: string) {
    return new ApiError(HttpStatus.FORBIDDEN, message, { code });
  }
  static NotFound(message = 'Not Found', code?: string) {
    return new ApiError(HttpStatus.NOT_FOUND, message, { code });
  }
  static TooManyRequests(message = 'Too Many Requests', code?: string) {
    return new ApiError(HttpStatus.TOO_MANY_REQUESTS, message, { code });
  }
}

export default ApiError;
