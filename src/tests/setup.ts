/// <reference types="jest" />

export {}; // makes this file a module (fixes global scope error)

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-key';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
});

afterAll(() => {
  // cleanup if needed
});

global.console = {
  ...console,
  log: () => {},
  debug: () => {},
  info: () => {},
  warn: console.warn,
  error: console.error
};