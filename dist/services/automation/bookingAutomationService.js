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
exports.runAfterBookingPersisted = runAfterBookingPersisted;
exports.ensureInitialMessageThread = ensureInitialMessageThread;
const client_1 = require("../../prisma/client");
const workerAssignmentService = __importStar(require("./workerAssignmentService"));
/**
 * Orchestrates post-create booking side-effects (assignment, thread, etc.).
 */
async function runAfterBookingPersisted(booking) {
    const service = await client_1.prisma.service.findUnique({
        where: { id: booking.serviceId },
    });
    if (!service) {
        return;
    }
    await workerAssignmentService.assignWorkerIfEligible(booking, service);
    // TODO: calendar materialization, further notifications, socket refresh.
}
async function ensureInitialMessageThread(bookingId, userId) {
    void userId;
    const booking = await client_1.prisma.booking.findUnique({
        where: { id: bookingId },
    });
    if (!booking) {
        return;
    }
    // TODO: create seed Message; requires valid senderId (User) for SYSTEM/welcome copy.
    void booking;
}
//# sourceMappingURL=bookingAutomationService.js.map