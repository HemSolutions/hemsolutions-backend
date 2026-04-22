import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth';
import * as bridge from '../../controllers/compat/appCompatBridgeController';
import { handleBookings } from '../../controllers/compat/bookingsCompatController';
import { handleCustomers } from '../../controllers/compat/customersCompatController';
import { handleInvoices } from '../../controllers/compat/invoicesCompatController';
import { handleWorkers } from '../../controllers/compat/workersCompatController';
import { handleReklamation } from '../../controllers/compat/compatReklamationController';
import { handleCustomerPrices } from '../../controllers/compat/compatCustomerPricesController';
import { handleCompatPdf } from '../../controllers/compat/compatPdfController';
import { handleSmsService } from '../../controllers/compat/compatSmsController';

const router = Router();

/** App legacy (authenticate only) — must be registered before admin-only compat block */
router.all('/messages', authenticate, bridge.handleMessages);
router.all('/payments', authenticate, bridge.handlePayments);
router.all('/receipts', authenticate, bridge.handleReceipts);
router.all('/settings', authenticate, bridge.handleSettings);
router.all('/reklamation', authenticate, requireRole('ADMIN', 'SUPER_ADMIN'), handleReklamation);
router.all('/customer-prices', authenticate, requireRole('ADMIN', 'SUPER_ADMIN'), handleCustomerPrices);
router.all('/articles', authenticate, bridge.handleArticles);
router.all('/reminders', authenticate, bridge.handleReminders);
router.all('/sms-service', authenticate, requireRole('ADMIN', 'SUPER_ADMIN'), handleSmsService);
router.all('/pdf/:resource', authenticate, handleCompatPdf);
router.all(
  '/admin/:segment',
  authenticate,
  requireRole('ADMIN', 'SUPER_ADMIN'),
  bridge.handleAdminSegment
);

router.use(authenticate, requireRole('ADMIN', 'SUPER_ADMIN'));

router.all('/customers', handleCustomers);
router.all('/bookings', handleBookings);
router.all('/invoices', handleInvoices);
router.all('/workers', handleWorkers);

export default router;
