import type { DashboardStats } from '../../types';
/**
 * Admin dashboard KPIs for GET /admin/dashboard (see adminController.getDashboardStats).
 */
export declare function fetchDashboardStats(): Promise<DashboardStats>;
/** Shape expected by `hemsolutions/app` DashboardStats (snake_case, PHP compat). */
export declare function fetchDashboardStatsPhpCompat(): Promise<Record<string, number>>;
