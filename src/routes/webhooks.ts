import { Router, raw } from 'express';
import * as invoiceController from '../controllers/invoiceController';

const router = Router();

// Stripe webhook - needs raw body
router.post(
  '/stripe',
  raw({ type: 'application/json' }),
  invoiceController.handleStripeWebhook
);

export default router;
