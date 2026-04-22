import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function errorHandler(
  err: Error, 
  req: Request, 
  res: Response, 
  _next: NextFunction
): void {
  const requestId = req.id ?? 'unknown';
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal Server Error'
    : (err?.message || 'Internal Server Error');
  logger.error('Unhandled request error', {
    requestId,
    message: err?.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack,
    path: req.originalUrl,
    method: req.method,
  });
  if (res.headersSent) {
    return;
  }
  res.status(500).json({
    success: false,
    error: message,
    requestId,
    timestamp: new Date().toISOString(),
  });
}
