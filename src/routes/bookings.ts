import { Router } from 'express';
import * as bookingController from '../controllers/bookingController';
import { authenticate, requireRole } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Customer routes
router.post(
  '/',
  bookingController.createBookingValidation,
  validateRequest,
  bookingController.createBooking
);

router.get('/', bookingController.getBookings);
router.get('/:id', bookingController.getBookingById);
router.put('/:id/cancel', bookingController.cancelBooking);

// Admin routes
router.get(
  '/admin/all',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  bookingController.getAllBookings
);

router.put(
  '/:id/assign',
  requireRole('ADMIN', 'SUPER_ADMIN'),
  bookingController.assignWorker
);

router.put(
  '/:id/status',
  requireRole('ADMIN', 'SUPER_ADMIN', 'WORKER'),
  bookingController.updateBookingStatus
);

export default router;
