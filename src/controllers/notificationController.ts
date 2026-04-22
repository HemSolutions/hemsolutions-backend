import { Request, Response } from 'express';
import { prisma } from '../prisma/client';
import { successResponse, errorResponse, paginatedResponse } from '../utils/response';
import { NotificationResponse } from '../types';

export async function getNotifications(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { unreadOnly, page = '1', limit = '20' } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const where: any = { userId };
    if (unreadOnly === 'true') {
      where.isRead = false;
    }

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum
      }),
      prisma.notification.count({ where })
    ]);

    const formatted: NotificationResponse[] = notifications.map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      data: n.data as Record<string, unknown> | null,
      isRead: n.isRead,
      createdAt: n.createdAt
    }));

    paginatedResponse(res, formatted, total, pageNum, limitNum);
  } catch (error) {
    console.error('Get notifications error:', error);
    errorResponse(res, 'Failed to get notifications', 500);
  }
}

export async function markAsRead(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const notification = await prisma.notification.findFirst({
      where: { id, userId }
    });

    if (!notification) {
      errorResponse(res, 'Notification not found', 404);
      return;
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() }
    });

    successResponse(res, updated, 'Notification marked as read');
  } catch (error) {
    console.error('Mark as read error:', error);
    errorResponse(res, 'Failed to mark as read', 500);
  }
}

export async function markAllAsRead(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;

    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() }
    });

    successResponse(res, null, 'All notifications marked as read');
  } catch (error) {
    console.error('Mark all as read error:', error);
    errorResponse(res, 'Failed to mark all as read', 500);
  }
}

export async function getUnreadCount(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;

    const count = await prisma.notification.count({
      where: { userId, isRead: false }
    });

    successResponse(res, { count });
  } catch (error) {
    console.error('Get unread count error:', error);
    errorResponse(res, 'Failed to get unread count', 500);
  }
}

export async function deleteNotification(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;

    const notification = await prisma.notification.findFirst({
      where: { id, userId }
    });

    if (!notification) {
      errorResponse(res, 'Notification not found', 404);
      return;
    }

    await prisma.notification.delete({
      where: { id }
    });

    successResponse(res, null, 'Notification deleted');
  } catch (error) {
    console.error('Delete notification error:', error);
    errorResponse(res, 'Failed to delete notification', 500);
  }
}
