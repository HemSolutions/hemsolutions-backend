"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.successResponse = successResponse;
exports.paginatedResponse = paginatedResponse;
exports.errorResponse = errorResponse;
function successResponse(res, data, message, statusCode = 200) {
    const response = {
        success: true,
        data,
        message
    };
    res.status(statusCode).json(response);
}
function paginatedResponse(res, data, total, page, limit, message) {
    const response = {
        success: true,
        data,
        message,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
    res.status(200).json(response);
}
function errorResponse(res, message, statusCode = 400, error) {
    const response = {
        success: false,
        message,
        error
    };
    res.status(statusCode).json(response);
}
//# sourceMappingURL=response.js.map