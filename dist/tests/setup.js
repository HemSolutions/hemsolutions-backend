"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Test setup file
const globals_1 = require("@jest/globals");
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
    log: globals_1.jest.fn(),
    debug: globals_1.jest.fn(),
    info: globals_1.jest.fn(),
    warn: console.warn,
    error: console.error
};
//# sourceMappingURL=setup.js.map