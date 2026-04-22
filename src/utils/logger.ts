import { config } from '../config';

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    if (config.server.isProduction) return;
    if (meta) console.log(message, meta);
    else console.log(message);
  },
  warn(message: string, meta?: unknown): void {
    console.warn(message, meta ?? '');
  },
  error(message: string, err?: unknown): void {
    console.error(message, err instanceof Error ? err.stack ?? err.message : err);
  },
};
