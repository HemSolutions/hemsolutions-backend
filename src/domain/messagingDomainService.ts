import type { Prisma, SenderType } from '@prisma/client';
import { prisma } from '../prisma/client';
import * as notificationOrchestrator from '../services/automation/notificationOrchestrator';
import { emitDomainEvent } from './internalEvents';

function assertThreadLinked(params: { bookingId?: string | null; conversationId?: string | null }): void {
  const b = (params.bookingId ?? '').trim();
  const c = (params.conversationId ?? '').trim();
  if (!b && !c) {
    throw new Error('Either bookingId or conversationId is required');
  }
}

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
  sender: { firstName: string; lastName: string } | null;
};

export async function createMessageCompat(params: {
  bookingId?: string | null;
  conversationId?: string | null;
  senderId: string;
  senderType: SenderType;
  content: string;
  attachments: string[];
}): Promise<MessageRow> {
  assertThreadLinked(params);
  const bookingId = params.bookingId?.trim() ? params.bookingId!.trim() : null;
  const conversationId = params.conversationId?.trim() ? params.conversationId!.trim() : null;

  const msg = await prisma.message.create({
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
  await emitDomainEvent({
    type: 'message.created',
    payload: {
      messageId: msg.id,
      bookingId: msg.bookingId,
      conversationId: msg.conversationId,
    },
  });
  return msg;
}

export async function updateMessageCompat(
  id: string,
  data: Prisma.MessageUpdateInput
): Promise<MessageRow> {
  return prisma.message.update({
    where: { id },
    data,
    include: { sender: { select: { firstName: true, lastName: true } } },
  });
}

export async function sendAppMessage(params: {
  bookingId: string | undefined;
  conversationId?: string | undefined;
  senderId: string;
  content: string;
  attachments: string[];
}): Promise<MessageRow> {
  assertThreadLinked({
    bookingId: params.bookingId,
    conversationId: params.conversationId,
  });
  const bookingId = params.bookingId?.trim() ? params.bookingId.trim() : null;
  const conversationId = params.conversationId?.trim() ? params.conversationId.trim() : null;

  const message = await prisma.message.create({
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
  await emitDomainEvent({
    type: 'message.created',
    payload: {
      messageId: message.id,
      bookingId: message.bookingId,
      conversationId: message.conversationId,
    },
  });
  return message;
}

export async function markMessagesReadForBooking(bookingId: string, readerUserId: string): Promise<void> {
  await prisma.message.updateMany({
    where: {
      bookingId,
      senderId: { not: readerUserId },
      isRead: false,
    },
    data: { isRead: true },
  });
}

export async function markMessagesReadForConversation(
  conversationId: string,
  readerUserId: string
): Promise<void> {
  await prisma.message.updateMany({
    where: {
      conversationId,
      senderId: { not: readerUserId },
      isRead: false,
    },
    data: { isRead: true },
  });
}

/** Unread count for app user: bookings they own or work on (matched worker email). */
export async function countUnreadMessagesForUser(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  const worker = user?.email
    ? await prisma.worker.findFirst({ where: { email: user.email }, select: { id: true } })
    : null;

  const bookingScoped = {
    OR: [
      { booking: { userId } },
      ...(worker ? [{ booking: { workerId: worker.id } }] : []),
    ],
  };

  return prisma.message.count({
    where: {
      isRead: false,
      senderId: { not: userId },
      bookingId: { not: null },
      ...bookingScoped,
    },
  });
}
