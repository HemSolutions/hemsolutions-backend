"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const logger_1 = require("../utils/logger");
function errorHandler(err, req, res, _next) {
    const requestId = req.id ?? 'unknown';
    const message = process.env.NODE_ENV === 'production'
        ? 'Internal Server Error'
        : (err?.message || 'Internal Server Error');
    logger_1.logger.error('Unhandled request error', {
        requestId,
        message: err?.message || 'Internal Server Error',
        stack: process.env.NODE_ENV === 'production' ? undefined : err?.stack,
        path: req.originalUrl,
        method: req.method,
    });
    if (res.headersSent) {
        return;
    }
    res.status(500).json({
        success: false,
        error: message,
        requestId,
        timestamp: new Date().toISOString(),
    });
}
//# sourceMappingURL=errorHandler.js.map