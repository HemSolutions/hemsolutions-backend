"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestTimeoutMiddleware = requestTimeoutMiddleware;
const DEFAULT_MS = 15_000;
/**
 * Aborts slow requests with 504 (does not cancel underlying Prisma work in all Node versions).
 */
function requestTimeoutMiddleware(timeoutMs = DEFAULT_MS) {
    return (req, res, next) => {
        const t = setTimeout(() => {
            if (!res.headersSent) {
                res.status(504).json({ success: false, message: 'Request timeout' });
            }
        }, timeoutMs);
        res.on('finish', () => clearTimeout(t));
        res.on('close', () => clearTimeout(t));
        next();
    };
}
//# sourceMappingURL=requestTimeout.js.map