import { Request, Response, NextFunction } from 'express';
import { TokenPayload } from '../utils/jwt';
declare global {
    namespace Express {
        interface Request {
            user?: TokenPayload;
        }
    }
}
export declare function authenticate(req: Request, res: Response, next: NextFunction): void;
export declare function requireRole(...roles: string[]): (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=auth.d.ts.map