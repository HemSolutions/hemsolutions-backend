"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAccessToken = generateAccessToken;
exports.generateRefreshToken = generateRefreshToken;
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const index_1 = require("../config/index");
function generateAccessToken(payload) {
    return jsonwebtoken_1.default.sign(payload, index_1.config.jwt.secret, {
        expiresIn: index_1.config.jwt.expiresIn
    });
}
function generateRefreshToken(payload) {
    return jsonwebtoken_1.default.sign(payload, index_1.config.jwt.refreshSecret, {
        expiresIn: index_1.config.jwt.refreshExpiresIn
    });
}
function verifyAccessToken(token) {
    return jsonwebtoken_1.default.verify(token, index_1.config.jwt.secret);
}
function verifyRefreshToken(token) {
    return jsonwebtoken_1.default.verify(token, index_1.config.jwt.refreshSecret);
}
//# sourceMappingURL=jwt.js.map