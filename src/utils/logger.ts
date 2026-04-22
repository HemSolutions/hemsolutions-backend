type LogLevel = 'info' | 'warn' | 'error';

function write(level: LogLevel, message: string, meta?: unknown): void {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    meta: meta ?? null,
  };
  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

export const logger = {
  info(message: string, meta?: unknown): void {
    write('info', message, meta);
  },
  warn(message: string, meta?: unknown): void {
    write('warn', message, meta);
  },
  error(message: string, meta?: unknown): void {
    write('error', message, meta);
  },
};
