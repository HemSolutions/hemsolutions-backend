import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../utils/logger';

export function requestTracing(req: Request, _res: Response, next: NextFunction): void {
  req.id = randomUUID();
  logger.info('[REQUEST]', {
    method: req.method,
    url: req.originalUrl,
    requestId: req.id,
  });
  next();
}
