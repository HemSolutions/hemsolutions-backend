"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
function write(level, message, meta) {
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
exports.logger = {
    info(message, meta) {
        write('info', message, meta);
    },
    warn(message, meta) {
        write('warn', message, meta);
    },
    error(message, meta) {
        write('error', message, meta);
    },
};
//# sourceMappingURL=logger.js.map