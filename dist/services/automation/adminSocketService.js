"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitAdminDashboardRefresh = emitAdminDashboardRefresh;
const ADMIN_REFRESH_EVENT = 'admin_dashboard_refresh';
/**
 * Pushes lightweight refresh hints to connected admin clients.
 */
function emitAdminDashboardRefresh(app) {
    const io = app.get('io');
    if (!io) {
        return;
    }
    io.emit(ADMIN_REFRESH_EVENT, { at: new Date().toISOString() });
}
//# sourceMappingURL=adminSocketService.js.map