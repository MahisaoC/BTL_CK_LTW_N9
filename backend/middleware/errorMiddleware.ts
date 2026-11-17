import type { Request, Response, NextFunction } from 'express';

export class HttpError extends Error {
  public statusCode: number;
  public code?: string;
  public details?: Record<string, string>;

  constructor(
    statusCode: number,
    message: string,
    details?: Record<string, string>,
    code?: string
  ) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.code = code;
  }
}

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    error: 'Not Found',
    message: `Không tìm thấy đường dẫn API: ${req.method} ${req.originalUrl}`,
  });
};

export const centralizedErrorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      error: err.statusCode >= 500 ? 'Internal Server Error' : 'Request Error',
      message: err.message,
      ...(err.code ? { code: err.code } : {}),
      ...(err.details ? { errors: err.details } : {}),
    });
    return;
  }

  // Handle Multer errors (e.g., LIMIT_FILE_SIZE, LIMIT_UNEXPECTED_FILE)
  if (err && typeof err === 'object' && 'code' in err) {
    const multerErr = err as { code?: string; message?: string };
    if (multerErr.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Dung lượng ảnh tải lên vượt quá giới hạn 5MB.',
      });
      return;
    }
    if (multerErr.code === 'LIMIT_FILE_COUNT' || multerErr.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Mỗi bài viết chỉ được tải lên tối đa 6 ảnh.',
      });
      return;
    }
  }

  const message =
    err instanceof Error ? err.message : 'Đã xảy ra lỗi hệ thống phía máy chủ.';
  res.status(500).json({
    error: 'Internal Server Error',
    message,
  });
};
