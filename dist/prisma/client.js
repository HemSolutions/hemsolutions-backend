"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.verifyDatabaseReadiness = verifyDatabaseReadiness;
const client_1 = require("@prisma/client");
const index_1 = require("../config/index");
const logger_1 = require("../utils/logger");
const globalForPrisma = globalThis;
exports.prisma = globalForPrisma.prisma ?? new client_1.PrismaClient({
    log: index_1.config.server.isDevelopment
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
});
if (index_1.config.server.isDevelopment) {
    globalForPrisma.prisma = exports.prisma;
}
async function verifyDatabaseReadiness() {
    try {
        await exports.prisma.$queryRaw `SELECT 1`;
        const [stripeTable, bookingIdx, invoiceIdx, messageIdx] = await Promise.all([
            exports.prisma.$queryRaw `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'stripe_webhook_events'
        ) AS exists
      `,
            exports.prisma.$queryRaw `
        SELECT EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
          AND tablename = 'bookings'
          AND indexname = 'bookings_workerId_status_scheduledDate_idx'
        ) AS exists
      `,
            exports.prisma.$queryRaw `
        SELECT EXISTS (
          SELECT 1
          FROM pg_indexes
          WHERE schemaname = 'public'
          AND tablename = 'invoices'
          AND indexname = 'invoices_userId_status_idx'
        ) AS exists
      `,
            exports.prisma.$queryRaw `
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
        ].filter((v) => Boolean(v));
        if (missing.length > 0) {
            logger_1.logger.warn('Database migration artifacts missing. Run prisma migrate deploy.', { missing });
            throw new Error(`Missing required database resources: ${missing.join(', ')}`);
        }
        logger_1.logger.warn('DB CONNECTED');
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        logger_1.logger.error('Database startup check failed', { reason, error });
        throw new Error(`Database startup check failed: ${reason}`);
    }
}
exports.default = exports.prisma;
//# sourceMappingURL=client.js.map