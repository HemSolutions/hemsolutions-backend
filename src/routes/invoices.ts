import { Router } from 'express';
import * as invoiceController from '../controllers/invoiceController';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/', invoiceController.getInvoices);
router.post('/manual', requireRole('ADMIN', 'SUPER_ADMIN'), invoiceController.createManualInvoice);
router.get('/:id', invoiceController.getInvoiceById);
router.post('/:id/pay', invoiceController.createPaymentIntentForInvoice);
router.post('/:id/send-email', requireRole('ADMIN', 'SUPER_ADMIN'), invoiceController.sendInvoiceEmail);
router.post('/:id/send-sms', requireRole('ADMIN', 'SUPER_ADMIN'), invoiceController.sendInvoiceSms);
router.post('/:id/reminder', requireRole('ADMIN', 'SUPER_ADMIN'), invoiceController.sendInvoiceReminder);
router.get('/:id/download', invoiceController.downloadInvoicePDF);

export default router;
