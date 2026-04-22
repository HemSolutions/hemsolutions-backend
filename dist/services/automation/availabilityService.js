"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBookingTimeWindow = getBookingTimeWindow;
exports.timeRangesOverlap = timeRangesOverlap;
exports.getConflictingBookings = getConflictingBookings;
exports.isSlotFree = isSlotFree;
const client_1 = require("../../prisma/client");
/**
 * Calendar + clock window for a booking (local date parts from `scheduledDate` + `scheduledTime`).
 */
function getBookingTimeWindow(booking) {
    const d = new Date(booking.scheduledDate);
    const [hours, minutes] = booking.scheduledTime.split(':').map((v) => parseInt(v, 10));
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hours, minutes, 0, 0);
    const end = new Date(start.getTime() + booking.duration * 60 * 1000);
    return { start, end };
}
function timeRangesOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
}
/**
 * Returns bookings for the worker whose time window overlaps [start, end).
 */
async function getConflictingBookings(workerId, start, end, excludeBookingId) {
    const rows = await client_1.prisma.booking.findMany({
        where: {
            workerId,
            status: { not: 'CANCELLED' },
            ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
        },
    });
    return rows.filter((b) => {
        const w = getBookingTimeWindow(b);
        return timeRangesOverlap(start, end, w.start, w.end);
    });
}
async function isSlotFree(workerId, start, end, excludeBookingId) {
    const conflicts = await getConflictingBookings(workerId, start, end, excludeBookingId);
    return conflicts.length === 0;
}
//# sourceMappingURL=availabilityService.js.map