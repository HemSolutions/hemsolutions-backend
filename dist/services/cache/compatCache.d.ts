export declare const compatCachePatterns: {
    readonly customers: "compat:v1:customers:*";
    readonly bookings: "compat:v1:bookings:*";
    readonly invoices: "compat:v1:invoices:*";
    readonly dashboard: "compat:v1:dashboard:*";
};
export declare function compatGetJson<T>(key: string, kind: 'short' | 'medium' | 'long'): Promise<T | null>;
export declare function compatSetJson(key: string, value: unknown, kind: 'short' | 'medium' | 'long'): Promise<void>;
export declare function invalidateCompatCustomers(): Promise<void>;
export declare function invalidateCompatBookings(): Promise<void>;
export declare function invalidateCompatInvoices(): Promise<void>;
export declare function invalidateCompatDashboard(): Promise<void>;
export declare function compatCacheKey(segment: string, query: Record<string, unknown>): string;
//# sourceMappingURL=compatCache.d.ts.map