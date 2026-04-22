import { NotificationType } from '@prisma/client';
export interface CreateNotificationInput {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    data?: Record<string, unknown>;
}
export declare function createNotification(input: CreateNotificationInput): Promise<void>;
export declare function createBulkNotifications(userIds: string[], input: Omit<CreateNotificationInput, 'userId'>): Promise<void>;
