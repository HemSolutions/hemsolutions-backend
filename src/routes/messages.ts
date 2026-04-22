import { Router } from 'express';
import * as messageController from '../controllers/messageController';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Conversations list
router.get('/conversations', messageController.getConversations);

// Chat history for a booking
router.get('/booking/:bookingId', messageController.getChatHistory);
router.post('/booking/:bookingId/read', messageController.markMessagesAsRead);

// Send message
router.post(
  '/',
  messageController.sendMessageValidation,
  validateRequest,
  messageController.sendMessage
);

export default router;
