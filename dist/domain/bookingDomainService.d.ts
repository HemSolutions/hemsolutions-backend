import type { Booking } from '@prisma/client';
export type BookingWithPhpJoins = Booking & {
    user: {
        firstName: string;
        lastName: string;
        email: string;
        phone: string | null;
    };
    service: {
        name: string;
    };
    worker: {
        firstName: string;
        lastName: string;
    } | null;
};
/**
 * Single mutation path for compat/admin-style booking creates (includes initial invoice).
 */
export declare function createCompatBookingWithInvoice(data: Record<string, unknown>): Promise<BookingWithPhpJoins>;
export declare function updateCompatBooking(id: string, data: Record<string, unknown>): Promise<BookingWithPhpJoins>;
export declare function deleteCompatBookingCascade(id: string): Promise<void>;
/** Admin API worker lifecycle — centralized here to keep controllers thin. */
export declare function adminCreateWorker(body: Record<string, unknown>): Promise<{
    id: string;
    createdAt: Date;
    email: string;
    updatedAt: Date;
    firstName: string;
    lastName: string;
    phone: string;
    isActive: boolean;
    avatar: string | null;
    bio: string | null;
    skills: string[];
    rating: number;
    totalJobs: number;
}>;
export declare function adminUpdateWorker(id: string, body: Record<string, unknown>): Promise<{
    id: string;
    createdAt: Date;
    email: string;
    updatedAt: Date;
    firstName: string;
    lastName: string;
    phone: string;
    isActive: boolean;
    avatar: string | null;
    bio: string | null;
    skills: string[];
    rating: number;
    totalJobs: number;
}>;
export declare function adminDeleteWorker(id: string): Promise<void>;
