import type { Prisma, SenderType } from '@prisma/client';
type MessageRow = {
    id: string;
    bookingId: string | null;
    conversationId: string | null;
    senderId: string;
    senderType: SenderType;
    content: string;
    attachments: string[];
    isRead: boolean;
    createdAt: Date;
    sender: {
        firstName: string;
        lastName: string;
    } | null;
};
export declare function createMessageCompat(params: {
    bookingId?: string | null;
    conversationId?: string | null;
    senderId: string;
    senderType: SenderType;
    content: string;
    attachments: string[];
}): Promise<MessageRow>;
export declare function updateMessageCompat(id: string, data: Prisma.MessageUpdateInput): Promise<MessageRow>;
export declare function sendAppMessage(params: {
    bookingId: string | undefined;
    conversationId?: string | undefined;
    senderId: string;
    content: string;
    attachments: string[];
}): Promise<MessageRow>;
export declare function markMessagesReadForBooking(bookingId: string, readerUserId: string): Promise<void>;
export declare function markMessagesReadForConversation(conversationId: string, readerUserId: string): Promise<void>;
/** Unread count for app user: bookings they own or work on (matched worker email). */
export declare function countUnreadMessagesForUser(userId: string): Promise<number>;
export {};
