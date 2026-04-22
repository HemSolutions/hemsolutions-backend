"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.strictRateLimiter = exports.apiRateLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const index_1 = require("../config/index");
exports.apiRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: index_1.config.rateLimit.windowMs,
    max: index_1.config.rateLimit.maxRequests,
    message: {
        success: false,
        message: 'Too many requests, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip || 'unknown'
});
exports.strictRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests
    message: {
        success: false,
        message: 'Too many attempts, please try again later'
    }
});
//# sourceMappingURL=rateLimit.js.map