import rateLimit from 'express-rate-limit';
import { config } from '@config/index';

export const apiRateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    message: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || 'unknown'
});

export const strictRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests
  message: {
    success: false,
    message: 'Too many attempts, please try again later'
  }
});
