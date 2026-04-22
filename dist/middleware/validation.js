"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRequest = validateRequest;
const express_validator_1 = require("express-validator");
const response_1 = require("../utils/response");
function validateRequest(req, res, next) {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const formattedErrors = errors.array().map((err) => {
            if (err.type === 'field') {
                return {
                    field: err.path,
                    message: err.msg
                };
            }
            return { message: err.msg };
        });
        (0, response_1.errorResponse)(res, 'Validation failed', 400, JSON.stringify(formattedErrors));
        return;
    }
    next();
}
//# sourceMappingURL=validation.js.map