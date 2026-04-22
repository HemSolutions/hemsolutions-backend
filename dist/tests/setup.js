"use strict";
// Test setup file
Object.defineProperty(exports, "__esModule", { value: true });
// Global test setup
beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret-key';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
});
afterAll(() => {
    // Cleanup
});
global.console = {
    ...console,
    log: () => { },
    debug: () => { },
    info: () => { },
    warn: console.warn,
    error: console.error
};
//# sourceMappingURL=setup.js.map