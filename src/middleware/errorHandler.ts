import { Request, Response, NextFunction } from 'express';
import { errorResponse } from '@utils/response';

export function errorHandler(
  err: Error, 
  req: Request, 
  res: Response, 
  _next: NextFunction
): void {
  console.error('Error:', err);
  
  if (err.name === 'PrismaClientKnownRequestError') {
    errorResponse(res, 'Database error', 500, 'An error occurred while accessing the database');
    return;
  }
  
  if (err.name === 'PrismaClientValidationError') {
    errorResponse(res, 'Invalid data provided', 400, 'Validation failed for the provided data');
    return;
  }
  
  errorResponse(res, 'Internal server error', 500, process.env.NODE_ENV === 'development' ? err.message : undefined);
}
