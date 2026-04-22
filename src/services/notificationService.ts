import { Prisma } from '@prisma/client';
import { NotificationType } from '@prisma/client';
import { prisma } from '../prisma/client';
import { logger } from '../utils/logger';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        data: (input.data ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    logger.error('Failed to create notification', error);
  }
}

export async function createBulkNotifications(
  userIds: string[],
  input: Omit<CreateNotificationInput, 'userId'>
): Promise<void> {
  try {
    const dataJson = (input.data ?? {}) as Prisma.InputJsonValue;
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        message: input.message,
        data: dataJson,
      })),
    });
  } catch (error) {
    logger.error('Failed to create bulk notifications', error);
  }
}
