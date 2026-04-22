export const env = {
  NODE_ENV: process.env.NODE_ENV || 'production',
  PORT: process.env.PORT || '10000',
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
  DATABASE_URL: process.env.DATABASE_URL,
};

if (!process.env.JWT_SECRET) {
  console.warn('[WARN] Missing JWT_SECRET');
}

if (!process.env.JWT_REFRESH_SECRET) {
  console.warn('[WARN] Missing JWT_REFRESH_SECRET');
}

if (!process.env.DATABASE_URL) {
  console.warn('[WARN] Missing DATABASE_URL (service will run in degraded mode)');
}
