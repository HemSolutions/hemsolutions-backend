import { Response } from 'express';
export declare function successResponse<T>(res: Response, data: T, message?: string, statusCode?: number): void;
export declare function paginatedResponse<T>(res: Response, data: T[], total: number, page: number, limit: number, message?: string): void;
export declare function errorResponse(res: Response, message: string, statusCode?: number, error?: string): void;
//# sourceMappingURL=response.d.ts.map