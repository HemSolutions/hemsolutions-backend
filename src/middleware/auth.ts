import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '@utils/jwt';
import { errorResponse } from '@utils/response';
import prisma from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      errorResponse(res, 'Authentication required', 401);
      return;
    }
    
    const token = authHeader.substring(7);
    const payload = verifyAccessToken(token);
    
    req.user = payload;
    next();
  } catch (error) {
    if (error instanceof Error && error.name === 'TokenExpiredError') {
      errorResponse(res, 'Token expired', 401);
      return;
    }
    errorResponse(res, 'Invalid token', 401);
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      errorResponse(res, 'Authentication required', 401);
      return;
    }
    
    if (!roles.includes(req.user.role)) {
      errorResponse(res, 'Insufficient permissions', 403);
      return;
    }
    
    next();
  };
}
