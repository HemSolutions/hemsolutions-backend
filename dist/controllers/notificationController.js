"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNotifications = getNotifications;
exports.markAsRead = markAsRead;
exports.markAllAsRead = markAllAsRead;
exports.getUnreadCount = getUnreadCount;
exports.deleteNotification = deleteNotification;
const client_1 = require("../prisma/client");
const response_1 = require("../utils/response");
async function getNotifications(req, res) {
    try {
        const userId = req.user.userId;
        const { unreadOnly, page = '1', limit = '20' } = req.query;
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const where = { userId };
        if (unreadOnly === 'true') {
            where.isRead = false;
        }
        const [notifications, total] = await Promise.all([
            client_1.prisma.notification.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (pageNum - 1) * limitNum,
                take: limitNum
            }),
            client_1.prisma.notification.count({ where })
        ]);
        const formatted = notifications.map(n => ({
            id: n.id,
            type: n.type,
            title: n.title,
            message: n.message,
            data: n.data,
            isRead: n.isRead,
            createdAt: n.createdAt
        }));
        (0, response_1.paginatedResponse)(res, formatted, total, pageNum, limitNum);
    }
    catch (error) {
        console.error('Get notifications error:', error);
        (0, response_1.errorResponse)(res, 'Failed to get notifications', 500);
    }
}
async function markAsRead(req, res) {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const notification = await client_1.prisma.notification.findFirst({
            where: { id, userId }
        });
        if (!notification) {
            (0, response_1.errorResponse)(res, 'Notification not found', 404);
            return;
        }
        const updated = await client_1.prisma.notification.update({
            where: { id },
            data: { isRead: true, readAt: new Date() }
        });
        (0, response_1.successResponse)(res, updated, 'Notification marked as read');
    }
    catch (error) {
        console.error('Mark as read error:', error);
        (0, response_1.errorResponse)(res, 'Failed to mark as read', 500);
    }
}
async function markAllAsRead(req, res) {
    try {
        const userId = req.user.userId;
        await client_1.prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true, readAt: new Date() }
        });
        (0, response_1.successResponse)(res, null, 'All notifications marked as read');
    }
    catch (error) {
        console.error('Mark all as read error:', error);
        (0, response_1.errorResponse)(res, 'Failed to mark all as read', 500);
    }
}
async function getUnreadCount(req, res) {
    try {
        const userId = req.user.userId;
        const count = await client_1.prisma.notification.count({
            where: { userId, isRead: false }
        });
        (0, response_1.successResponse)(res, { count });
    }
    catch (error) {
        console.error('Get unread count error:', error);
        (0, response_1.errorResponse)(res, 'Failed to get unread count', 500);
    }
}
async function deleteNotification(req, res) {
    try {
        const userId = req.user.userId;
        const { id } = req.params;
        const notification = await client_1.prisma.notification.findFirst({
            where: { id, userId }
        });
        if (!notification) {
            (0, response_1.errorResponse)(res, 'Notification not found', 404);
            return;
        }
        await client_1.prisma.notification.delete({
            where: { id }
        });
        (0, response_1.successResponse)(res, null, 'Notification deleted');
    }
    catch (error) {
        console.error('Delete notification error:', error);
        (0, response_1.errorResponse)(res, 'Failed to delete notification', 500);
    }
}
//# sourceMappingURL=notificationController.js.map