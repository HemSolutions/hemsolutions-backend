import { Router } from 'express';
import * as bookingController from '../controllers/bookingController';
import { authenticate, requireRole } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';

const router = Router();

// Public booking endpoint for website form
router.post('/public', bookingController.createPublicBooking);

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

router.put(
  '/:id/reschedule',
  requireRole('ADMIN', 'SUPER_ADMIN', 'WORKER'),
  bookingController.rescheduleBooking
);

export default router;
