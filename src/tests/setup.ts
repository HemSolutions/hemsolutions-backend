// Test setup file
import { jest } from '@jest/globals';

// Global test setup
beforeAll(() => {
  // Setup test environment
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-key';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
});

afterAll(() => {
  // Cleanup
});

// Mock implementations
global.console = {
  ...console,
  // Suppress console during tests unless explicitly needed
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: console.warn,
  error: console.error
};
