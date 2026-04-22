import { Router } from 'express';
import * as serviceController from '../controllers/serviceController';
import { authenticate, requireRole } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';

const router = Router();

// Public routes
router.get('/', serviceController.getServices);
router.get('/:slug', serviceController.getServiceBySlug);

// Admin routes
router.post(
  '/',
  authenticate,
  requireRole('ADMIN', 'SUPER_ADMIN'),
  serviceController.createServiceValidation,
  validateRequest,
  serviceController.createService
);

router.put(
  '/:id',
  authenticate,
  requireRole('ADMIN', 'SUPER_ADMIN'),
  serviceController.createServiceValidation,
  validateRequest,
  serviceController.updateService
);

router.delete(
  '/:id',
  authenticate,
  requireRole('ADMIN', 'SUPER_ADMIN'),
  serviceController.deleteService
);

export default router;
