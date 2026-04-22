"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.requireRole = requireRole;
const jwt_1 = require("../utils/jwt");
const response_1 = require("../utils/response");
function authenticate(req, res, next) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            (0, response_1.errorResponse)(res, 'Authentication required', 401);
            return;
        }
        const token = authHeader.substring(7);
        const payload = (0, jwt_1.verifyAccessToken)(token);
        req.user = payload;
        next();
    }
    catch (error) {
        if (error instanceof Error && error.name === 'TokenExpiredError') {
            (0, response_1.errorResponse)(res, 'Token expired', 401);
            return;
        }
        (0, response_1.errorResponse)(res, 'Invalid token', 401);
    }
}
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            (0, response_1.errorResponse)(res, 'Authentication required', 401);
            return;
        }
        if (!roles.includes(req.user.role)) {
            (0, response_1.errorResponse)(res, 'Insufficient permissions', 403);
            return;
        }
        next();
    };
}
//# sourceMappingURL=auth.js.map