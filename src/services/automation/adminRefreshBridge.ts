import type { Application } from 'express';
import { emitAdminDashboardRefresh } from './adminSocketService';

let registeredApp: Application | undefined;

export function registerAdminRefreshApp(app: Application): void {
  registeredApp = app;
}

export function triggerAdminDashboardRefresh(): void {
  if (!registeredApp) return;
  emitAdminDashboardRefresh(registeredApp);
}
