import type { Request, Response, NextFunction } from 'express';
/**
 * Aborts slow requests with 504 (does not cancel underlying Prisma work in all Node versions).
 */
export declare function requestTimeoutMiddleware(timeoutMs?: number): (req: Request, res: Response, next: NextFunction) => void;
