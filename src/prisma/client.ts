import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { logger } from '../utils/logger';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: config.server.isDevelopment 
    ? ['query', 'info', 'warn', 'error'] 
    : ['error'],
});

if (config.server.isDevelopment) {
  globalForPrisma.prisma = prisma;
}

export async function verifyDatabaseReadiness(): Promise<void> {
  try {
    await prisma.$queryRaw`SELECT 1`;

    const [stripeTable, bookingIdx, invoiceIdx, messageIdx] = await Promise.all([
      prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'stripe_webhook_events'
        ) AS exists
      `,
      prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
          AND tablename = 'bookings'
          AND indexname = 'bookings_workerId_status_scheduledDate_idx'
        ) AS exists
      `,
      prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
          AND tablename = 'invoices'
          AND indexname = 'invoices_userId_status_idx'
        ) AS exists
      `,
      prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
          AND tablename = 'messages'
          AND indexname = 'messages_bookingId_createdAt_idx'
        ) AS exists
      `,
    ]);

    const missing = [
      !stripeTable[0]?.exists ? 'stripe_webhook_events' : null,
      !bookingIdx[0]?.exists ? 'bookings_workerId_status_scheduledDate_idx' : null,
      !invoiceIdx[0]?.exists ? 'invoices_userId_status_idx' : null,
      !messageIdx[0]?.exists ? 'messages_bookingId_createdAt_idx' : null,
    ].filter((v): v is string => Boolean(v));

    if (missing.length > 0) {
      logger.warn('Database migration artifacts missing. Run prisma migrate deploy.', { missing });
      throw new Error(`Missing required database resources: ${missing.join(', ')}`);
    }
    logger.warn('DB CONNECTED');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.error('Database startup check failed', { reason, error });
    throw new Error(`Database startup check failed: ${reason}`);
  }
}

export default prisma;
