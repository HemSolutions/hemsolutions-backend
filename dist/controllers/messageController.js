"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessageValidation = void 0;
exports.getChatHistory = getChatHistory;
exports.sendMessage = sendMessage;
exports.markMessagesAsRead = markMessagesAsRead;
exports.getConversations = getConversations;
const express_validator_1 = require("express-validator");
const client_1 = require("../prisma/client");
const response_1 = require("../utils/response");
const messagingDomainService = __importStar(require("../domain/messagingDomainService"));
exports.sendMessageValidation = [
    (0, express_validator_1.body)('bookingId').optional().isUUID().withMessage('Valid booking ID is required'),
    (0, express_validator_1.body)('conversationId').optional().isString().trim().notEmpty().withMessage('conversationId must be non-empty when provided'),
    (0, express_validator_1.body)('content').trim().notEmpty().withMessage('Message content is required'),
    (0, express_validator_1.body)('attachments').optional().isArray()
];
async function getChatHistory(req, res) {
    try {
        const userId = req.user.userId;
        const { bookingId } = req.params;
        const { page = '1', limit = '50' } = req.query;
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        // Verify booking belongs to user
        const booking = await client_1.prisma.booking.findFirst({
            where: { id: bookingId, userId }
        });
        if (!booking) {
            (0, response_1.errorResponse)(res, 'Booking not found', 404);
            return;
        }
        const [messages, total] = await Promise.all([
            client_1.prisma.message.findMany({
                where: { bookingId },
                include: {
                    sender: { select: { firstName: true, lastName: true } }
                },
                orderBy: { createdAt: 'asc' },
                skip: (pageNum - 1) * limitNum,
                take: limitNum
            }),
            client_1.prisma.message.count({ where: { bookingId } })
        ]);
        const formatted = messages.map(msg => ({
            id: msg.id,
            senderId: msg.senderId,
            senderName: `${msg.sender.firstName} ${msg.sender.lastName}`,
            senderType: msg.senderType,
            content: msg.content,
            attachments: msg.attachments,
            isRead: msg.isRead,
            createdAt: msg.createdAt
        }));
        (0, response_1.paginatedResponse)(res, formatted, total, pageNum, limitNum);
    }
    catch (error) {
        console.error('Get chat history error:', error);
        (0, response_1.errorResponse)(res, 'Failed to get chat history', 500);
    }
}
async function sendMessage(req, res) {
    try {
        const senderId = req.user.userId;
        const { bookingId, conversationId, content, attachments } = req.body;
        if (!bookingId?.trim() && !conversationId?.trim()) {
            (0, response_1.errorResponse)(res, 'bookingId or conversationId is required', 400);
            return;
        }
        if (bookingId) {
            const booking = await client_1.prisma.booking.findFirst({
                where: {
                    id: bookingId,
                    OR: [{ userId: senderId }, { workerId: senderId }]
                }
            });
            if (!booking) {
                (0, response_1.errorResponse)(res, 'Booking not found or access denied', 404);
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
        const response = {
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
            }
            else if (conversationId) {
                io.to(`conversation:${conversationId}`).emit('new_message', response);
            }
        }
        (0, response_1.successResponse)(res, response, 'Message sent successfully', 201);
    }
    catch (error) {
        console.error('Send message error:', error);
        (0, response_1.errorResponse)(res, 'Failed to send message', 500);
    }
}
async function markMessagesAsRead(req, res) {
    try {
        const userId = req.user.userId;
        const { bookingId } = req.params;
        await messagingDomainService.markMessagesReadForBooking(bookingId, userId);
        (0, response_1.successResponse)(res, null, 'Messages marked as read');
    }
    catch (error) {
        console.error('Mark as read error:', error);
        (0, response_1.errorResponse)(res, 'Failed to mark messages as read', 500);
    }
}
// Get all messages for user (recent conversations)
async function getConversations(req, res) {
    try {
        const userId = req.user.userId;
        // Get unique bookings with messages
        const bookingsWithMessages = await client_1.prisma.booking.findMany({
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
        (0, response_1.successResponse)(res, conversations);
    }
    catch (error) {
        console.error('Get conversations error:', error);
        (0, response_1.errorResponse)(res, 'Failed to get conversations', 500);
    }
}
//# sourceMappingURL=messageController.js.map