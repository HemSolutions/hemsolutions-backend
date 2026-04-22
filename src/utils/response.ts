import { Response } from 'express';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export function successResponse<T>(res: Response, data: T, message?: string, statusCode = 200): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
    message
  };
  res.status(statusCode).json(response);
}

export function paginatedResponse<T>(
  res: Response, 
  data: T[], 
  total: number, 
  page: number, 
  limit: number,
  message?: string
): void {
  const response: ApiResponse<T[]> = {
    success: true,
    data,
    message,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
  res.status(200).json(response);
}

export function errorResponse(res: Response, message: string, statusCode = 400, error?: string): void {
  const response: ApiResponse<never> = {
    success: false,
    message,
    error
  };
  res.status(statusCode).json(response);
}
