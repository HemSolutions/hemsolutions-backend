/**
 * Wires domain events → existing automation (single orchestration path).
 * Import this once from `server.ts` after env is loaded.
 */
import { subscribeDomainEvents } from './internalEvents';
import * as invoiceAutomationService from '../services/automation/invoiceAutomationService';
import * as bookingAutomationService from '../services/automation/bookingAutomationService';
import * as notificationOrchestrator from '../services/automation/notificationOrchestrator';
import { prisma } from '../prisma/client';
import { utcYmd } from '../controllers/compat/mappers';
import { triggerAdminDashboardRefresh } from '../services/automation/adminRefreshBridge';

let installed = false;

export function installDomainEventHandlers(): void {
  if (installed) return;
  installed = true;

  subscribeDomainEvents(async (e) => {
    if (e.type === 'booking.completed') {
      await invoiceAutomationService.onBookingCompleted(e.payload.bookingId, e.payload.userId);
    }

    if (e.type === 'booking.created') {
      const b = await prisma.booking.findUnique({
        where: { id: e.payload.bookingId },
        include: { service: true },
      });
      if (!b?.service) {
        return;
      }
      await bookingAutomationService.runAfterBookingPersisted(b);
      await notificationOrchestrator.afterBookingCreated({
        userId: b.userId,
        bookingId: b.id,
        service: b.service,
        scheduledDate: utcYmd(b.scheduledDate),
        scheduledTime: b.scheduledTime,
      });
      triggerAdminDashboardRefresh();
    }

    if (e.type === 'payment.succeeded') {
      const inv = await prisma.invoice.findUnique({
        where: { id: e.payload.invoiceId },
        select: { userId: true, invoiceNumber: true, id: true },
      });
      if (inv) {
        await notificationOrchestrator.afterInvoicePaid({
          userId: inv.userId,
          invoiceNumber: inv.invoiceNumber,
          invoiceId: inv.id,
          amount: e.payload.amount,
        });
      }
    }
  });
}
