import type { Request, Response, NextFunction } from 'express';

const DEFAULT_MS = 15_000;

/**
 * Aborts slow requests with 504 (does not cancel underlying Prisma work in all Node versions).
 */
export function requestTimeoutMiddleware(timeoutMs = DEFAULT_MS) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const t = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({ success: false, message: 'Request timeout' });
      }
    }, timeoutMs);
    res.on('finish', () => clearTimeout(t));
    res.on('close', () => clearTimeout(t));
    next();
  };
}
