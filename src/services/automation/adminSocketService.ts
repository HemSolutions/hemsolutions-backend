import type { Application } from 'express';
import type { Server as SocketIOServer } from 'socket.io';

const ADMIN_REFRESH_EVENT = 'admin_dashboard_refresh';

/**
 * Pushes lightweight refresh hints to connected admin clients.
 */
export function emitAdminDashboardRefresh(app: Application): void {
  const io = app.get('io') as SocketIOServer | undefined;

  if (!io) {
    return;
  }

  io.emit(ADMIN_REFRESH_EVENT, { at: new Date().toISOString() });
}
