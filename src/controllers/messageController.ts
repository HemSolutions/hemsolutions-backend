import { Request, Response } from 'express';
import { body } from 'express-validator';
import { prisma } from '../prisma/client';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response';
import * as messagingDomainService from '../domain/messagingDomainService';
import { CreateMessageInput, MessageResponse } from '../types';

export const sendMessageValidation = [
  body('bookingId').optional().isUUID().withMessage('Valid booking ID is required'),
  body('conversationId').optional().isString().trim().notEmpty().withMessage('conversationId must be non-empty when provided'),
  body('content').trim().notEmpty().withMessage('Message content is required'),
  body('attachments').optional().isArray()
];

export async function getChatHistory(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { bookingId } = req.params;
    const { page = '1', limit = '50' } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    // Verify booking belongs to user
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, userId }
    });

    if (!booking) {
      errorResponse(res, 'Booking not found', 404);
      return;
    }

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { bookingId },
        include: {
          sender: { select: { firstName: true, lastName: true } }
        },
        orderBy: { createdAt: 'asc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum
      }),
      prisma.message.count({ where: { bookingId } })
    ]);

    const formatted: MessageResponse[] = messages.map(msg => ({
      id: msg.id,
      senderId: msg.senderId,
      senderName: `${msg.sender.firstName} ${msg.sender.lastName}`,
      senderType: msg.senderType,
      content: msg.content,
      attachments: msg.attachments,
      isRead: msg.isRead,
      createdAt: msg.createdAt
    }));

    paginatedResponse(res, formatted, total, pageNum, limitNum);
  } catch (error) {
    console.error('Get chat history error:', error);
    errorResponse(res, 'Failed to get chat history', 500);
  }
}

export async function sendMessage(req: Request, res: Response): Promise<void> {
  try {
    const senderId = req.user!.userId;
    const { bookingId, conversationId, content, attachments } = req.body as CreateMessageInput;

    if (!bookingId?.trim() && !conversationId?.trim()) {
      errorResponse(res, 'bookingId or conversationId is required', 400);
      return;
    }

    if (bookingId) {
      const booking = await prisma.booking.findFirst({
        where: {
          id: bookingId,
          OR: [{ userId: senderId }, { workerId: senderId }]
        }
      });

      if (!booking) {
        errorResponse(res, 'Booking not found or access denied', 404);
        return;
      }
    }

    const message = await messagingDomainService.sendAppMessage({
      bookingId,
      conversationId,
      senderId,
      content,
      attachments: attachments || [],
    });

    const senderName = message.sender
      ? `${message.sender.firstName} ${message.sender.lastName}`.trim()
      : 'Unknown';

    const response: MessageResponse = {
      id: message.id,
      senderId: message.senderId,
      senderName,
      senderType: message.senderType,
      content: message.content,
      attachments: message.attachments,
      isRead: message.isRead,
      createdAt: message.createdAt
    };

    // Emit to socket if available
    if (req.app.get('io')) {
      const io = req.app.get('io');
      if (bookingId) {
        io.to(`booking:${bookingId}`).emit('new_message', response);
      } else if (conversationId) {
        io.to(`conversation:${conversationId}`).emit('new_message', response);
      }
    }

    successResponse(res, response, 'Message sent successfully', 201);
  } catch (error) {
    console.error('Send message error:', error);
    errorResponse(res, 'Failed to send message', 500);
  }
}

export async function markMessagesAsRead(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { bookingId } = req.params;

    await messagingDomainService.markMessagesReadForBooking(bookingId, userId);

    successResponse(res, null, 'Messages marked as read');
  } catch (error) {
    console.error('Mark as read error:', error);
    errorResponse(res, 'Failed to mark messages as read', 500);
  }
}

// Get all messages for user (recent conversations)
export async function getConversations(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;

    // Get unique bookings with messages
    const bookingsWithMessages = await prisma.booking.findMany({
      where: {
        userId,
        messages: { some: {} }
      },
      include: {
        service: { select: { name: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { firstName: true, lastName: true } }
          }
        }
      },
      orderBy: {
        messages: {
          _count: 'desc'
        }
      },
      take: 20
    });

    const conversations = bookingsWithMessages.map(booking => ({
      bookingId: booking.id,
      serviceName: booking.service.name,
      lastMessage: booking.messages[0] ? {
        content: booking.messages[0].content,
        sender: `${booking.messages[0].sender.firstName} ${booking.messages[0].sender.lastName}`,
        createdAt: booking.messages[0].createdAt,
        isRead: booking.messages[0].isRead
      } : null
    }));

    successResponse(res, conversations);
  } catch (error) {
    console.error('Get conversations error:', error);
    errorResponse(res, 'Failed to get conversations', 500);
  }
}
