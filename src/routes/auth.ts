import { Router } from 'express';
import * as authController from '../controllers/authController';
import { validateRequest } from '../middleware/validation';
import { strictRateLimiter } from '../middleware/rateLimit';

const router = Router();

// Public routes
router.post(
  '/register',
  strictRateLimiter,
  authController.registerValidation,
  validateRequest,
  authController.register
);

router.post(
  '/login',
  strictRateLimiter,
  authController.loginValidation,
  validateRequest,
  authController.login
);

router.post('/logout', authController.logout);
router.post('/refresh', authController.refresh);

router.post(
  '/forgot-password',
  strictRateLimiter,
  authController.forgotPasswordValidation,
  validateRequest,
  authController.forgotPassword
);

router.post(
  '/reset-password',
  strictRateLimiter,
  authController.resetPasswordValidation,
  validateRequest,
  authController.resetPassword
);

export default router;
