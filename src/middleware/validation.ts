import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationError } from 'express-validator';
import { errorResponse } from '@utils/response';

export function validateRequest(req: Request, res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err: ValidationError) => {
      if (err.type === 'field') {
        return {
          field: err.path,
          message: err.msg
        };
      }
      return { message: err.msg };
    });
    
    errorResponse(res, 'Validation failed', 400, JSON.stringify(formattedErrors));
    return;
  }
  
  next();
}
