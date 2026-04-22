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
exports.installDomainEventHandlers = installDomainEventHandlers;
/**
 * Wires domain events → existing automation (single orchestration path).
 * Import this once from `server.ts` after env is loaded.
 */
const internalEvents_1 = require("./internalEvents");
const invoiceAutomationService = __importStar(require("../services/automation/invoiceAutomationService"));
const bookingAutomationService = __importStar(require("../services/automation/bookingAutomationService"));
const notificationOrchestrator = __importStar(require("../services/automation/notificationOrchestrator"));
const client_1 = require("../prisma/client");
const mappers_1 = require("../controllers/compat/mappers");
const adminRefreshBridge_1 = require("../services/automation/adminRefreshBridge");
let installed = false;
function installDomainEventHandlers() {
    if (installed)
        return;
    installed = true;
    (0, internalEvents_1.subscribeDomainEvents)(async (e) => {
        if (e.type === 'booking.completed') {
            await invoiceAutomationService.onBookingCompleted(e.payload.bookingId, e.payload.userId);
        }
        if (e.type === 'booking.created') {
            const b = await client_1.prisma.booking.findUnique({
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
                scheduledDate: (0, mappers_1.utcYmd)(b.scheduledDate),
                scheduledTime: b.scheduledTime,
            });
            (0, adminRefreshBridge_1.triggerAdminDashboardRefresh)();
        }
        if (e.type === 'payment.succeeded') {
            const inv = await client_1.prisma.invoice.findUnique({
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
//# sourceMappingURL=domainEventBootstrap.js.map