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
exports.assignWorkerIfEligible = assignWorkerIfEligible;
exports.assertNoCollision = assertNoCollision;
const client_1 = require("../../prisma/client");
const availabilityService = __importStar(require("./availabilityService"));
function scheduleCoversWindow(schedules, windowStart, windowEnd) {
    const dayOfWeek = windowStart.getDay();
    const sched = schedules.find((s) => s.dayOfWeek === dayOfWeek && s.isActive);
    if (!sched) {
        return false;
    }
    const y = windowStart.getFullYear();
    const mo = windowStart.getMonth();
    const d = windowStart.getDate();
    const [sh, sm] = sched.startTime.split(':').map((x) => parseInt(x, 10));
    const [eh, em] = sched.endTime.split(':').map((x) => parseInt(x, 10));
    const scheduleStart = new Date(y, mo, d, sh, sm, 0, 0);
    const scheduleEnd = new Date(y, mo, d, eh, em, 0, 0);
    if (scheduleEnd.getTime() <= scheduleStart.getTime()) {
        return false;
    }
    return (windowStart.getTime() >= scheduleStart.getTime() &&
        windowEnd.getTime() <= scheduleEnd.getTime());
}
/**
 * Auto-assign workers and enforce no double-booking.
 */
async function assignWorkerIfEligible(booking, service) {
    void service;
    if (booking.workerId) {
        return client_1.prisma.booking.findUnique({ where: { id: booking.id } });
    }
    const { start, end } = availabilityService.getBookingTimeWindow(booking);
    const dayOfWeek = start.getDay();
    const workers = await client_1.prisma.worker.findMany({
        where: {
            isActive: true,
            schedules: {
                some: {
                    dayOfWeek,
                    isActive: true,
                },
            },
        },
        include: {
            schedules: {
                where: {
                    dayOfWeek,
                    isActive: true,
                },
            },
        },
        orderBy: { id: 'asc' },
    });
    for (const worker of workers) {
        if (!scheduleCoversWindow(worker.schedules, start, end)) {
            continue;
        }
        const free = await availabilityService.isSlotFree(worker.id, start, end, booking.id);
        if (!free) {
            continue;
        }
        return client_1.prisma.booking.update({
            where: { id: booking.id },
            data: {
                workerId: worker.id,
                status: 'ASSIGNED',
            },
        });
    }
    return null;
}
async function assertNoCollision(workerId, booking) {
    const { start, end } = availabilityService.getBookingTimeWindow(booking);
    const conflicts = await availabilityService.getConflictingBookings(workerId, start, end, booking.id);
    if (conflicts.length > 0) {
        throw new Error('Worker has a conflicting booking in this time window');
    }
}
//# sourceMappingURL=workerAssignmentService.js.map