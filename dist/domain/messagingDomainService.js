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
exports.createMessageCompat = createMessageCompat;
exports.updateMessageCompat = updateMessageCompat;
exports.sendAppMessage = sendAppMessage;
exports.markMessagesReadForBooking = markMessagesReadForBooking;
exports.markMessagesReadForConversation = markMessagesReadForConversation;
exports.countUnreadMessagesForUser = countUnreadMessagesForUser;
const client_1 = require("../prisma/client");
const notificationOrchestrator = __importStar(require("../services/automation/notificationOrchestrator"));
const internalEvents_1 = require("./internalEvents");
function assertThreadLinked(params) {
    const b = (params.bookingId ?? '').trim();
    const c = (params.conversationId ?? '').trim();
    if (!b && !c) {
        throw new Error('Either bookingId or conversationId is required');
    }
}
async function createMessageCompat(params) {
    assertThreadLinked(params);
    const bookingId = params.bookingId?.trim() ? params.bookingId.trim() : null;
    const conversationId = params.conversationId?.trim() ? params.conversationId.trim() : null;
    const msg = await client_1.prisma.message.create({
        data: {
            bookingId,
            conversationId,
            senderId: params.senderId,
            senderType: params.senderType,
            content: params.content,
            attachments: params.attachments,
        },
        include: { sender: { select: { firstName: true, lastName: true } } },
    });
    await notificationOrchestrator.afterMessageSent({
        message: msg,
        recipientUserId: undefined,
    });
    await (0, internalEvents_1.emitDomainEvent)({
        type: 'message.created',
        payload: {
            messageId: msg.id,
            bookingId: msg.bookingId,
            conversationId: msg.conversationId,
        },
    });
    return msg;
}
async function updateMessageCompat(id, data) {
    return client_1.prisma.message.update({
        where: { id },
        data,
        include: { sender: { select: { firstName: true, lastName: true } } },
    });
}
async function sendAppMessage(params) {
    assertThreadLinked({
        bookingId: params.bookingId,
        conversationId: params.conversationId,
    });
    const bookingId = params.bookingId?.trim() ? params.bookingId.trim() : null;
    const conversationId = params.conversationId?.trim() ? params.conversationId.trim() : null;
    const message = await client_1.prisma.message.create({
        data: {
            bookingId,
            conversationId,
            senderId: params.senderId,
            senderType: 'USER',
            content: params.content,
            attachments: params.attachments || [],
        },
        include: {
            sender: { select: { firstName: true, lastName: true } },
        },
    });
    await notificationOrchestrator.afterMessageSent({
        message,
        recipientUserId: undefined,
    });
    await (0, internalEvents_1.emitDomainEvent)({
        type: 'message.created',
        payload: {
            messageId: message.id,
            bookingId: message.bookingId,
            conversationId: message.conversationId,
        },
    });
    return message;
}
async function markMessagesReadForBooking(bookingId, readerUserId) {
    await client_1.prisma.message.updateMany({
        where: {
            bookingId,
            senderId: { not: readerUserId },
            isRead: false,
        },
        data: { isRead: true },
    });
}
async function markMessagesReadForConversation(conversationId, readerUserId) {
    await client_1.prisma.message.updateMany({
        where: {
            conversationId,
            senderId: { not: readerUserId },
            isRead: false,
        },
        data: { isRead: true },
    });
}
/** Unread count for app user: bookings they own or work on (matched worker email). */
async function countUnreadMessagesForUser(userId) {
    const user = await client_1.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
    });
    const worker = user?.email
        ? await client_1.prisma.worker.findFirst({ where: { email: user.email }, select: { id: true } })
        : null;
    const bookingScoped = {
        OR: [
            { booking: { userId } },
            ...(worker ? [{ booking: { workerId: worker.id } }] : []),
        ],
    };
    return client_1.prisma.message.count({
        where: {
            isRead: false,
            senderId: { not: userId },
            bookingId: { not: null },
            ...bookingScoped,
        },
    });
}
//# sourceMappingURL=messagingDomainService.js.map