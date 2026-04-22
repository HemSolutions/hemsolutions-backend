"use strict";
/// <reference types="jest" />
Object.defineProperty(exports, "__esModule", { value: true });
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
    log: () => { },
    debug: () => { },
    info: () => { },
    warn: console.warn,
    error: console.error
};
//# sourceMappingURL=setup.js.map