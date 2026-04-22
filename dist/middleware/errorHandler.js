"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const response_1 = require("../utils/response");
function errorHandler(err, req, res, _next) {
    console.error('Error:', err);
    if (err.name === 'PrismaClientKnownRequestError') {
        (0, response_1.errorResponse)(res, 'Database error', 500, 'An error occurred while accessing the database');
        return;
    }
    if (err.name === 'PrismaClientValidationError') {
        (0, response_1.errorResponse)(res, 'Invalid data provided', 400, 'Validation failed for the provided data');
        return;
    }
    (0, response_1.errorResponse)(res, 'Internal server error', 500, process.env.NODE_ENV === 'development' ? err.message : undefined);
}
//# sourceMappingURL=errorHandler.js.map