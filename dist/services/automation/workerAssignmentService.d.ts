import type { Booking, Service } from '@prisma/client';
/**
 * Auto-assign workers and enforce no double-booking.
 */
export declare function assignWorkerIfEligible(booking: Booking, service: Service): Promise<Booking | null>;
export declare function assertNoCollision(workerId: string, booking: Booking): Promise<void>;
//# sourceMappingURL=workerAssignmentService.d.ts.map