import { Router } from 'express';
import * as invoiceController from '../controllers/invoiceController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/', invoiceController.getInvoices);
router.get('/:id', invoiceController.getInvoiceById);
router.post('/:id/pay', invoiceController.createPaymentIntentForInvoice);
router.get('/:id/download', invoiceController.downloadInvoicePDF);

export default router;
