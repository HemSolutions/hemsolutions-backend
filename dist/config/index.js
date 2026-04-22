"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.getConfigValidationResult = getConfigValidationResult;
exports.validateConfig = validateConfig;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    server: {
        port: parseInt(process.env.PORT || '3001', 10),
        nodeEnv: process.env.NODE_ENV || 'development',
        isDevelopment: process.env.NODE_ENV !== 'production',
        isProduction: process.env.NODE_ENV === 'production'
    },
    database: {
        url: process.env.DATABASE_URL || ''
    },
    redis: {
        url: process.env.REDIS_URL || ''
    },
    jwt: {
        secret: process.env.JWT_SECRET || 'default-secret-change-in-production',
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret',
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
    },
    stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY || '',
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || ''
    },
    email: {
        sendgridApiKey: process.env.SENDGRID_API_KEY || '',
        from: process.env.EMAIL_FROM || 'noreply@hemsolutions.se',
        fromName: process.env.EMAIL_FROM_NAME || 'HemSolutions'
    },
    frontend: {
        url: process.env.FRONTEND_URL || 'http://localhost:5173'
    },
    upload: {
        dir: process.env.UPLOAD_DIR || 'uploads',
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10)
    },
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10)
    }
};
function collectConfigValidation() {
    const required = ['DATABASE_URL', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
    const optional = ['REDIS_URL', 'SENDGRID_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];
    return {
        missingRequired: required.filter((key) => !process.env[key]),
        missingOptional: optional.filter((key) => !process.env[key]),
    };
}
function getConfigValidationResult() {
    return collectConfigValidation();
}
function validateDatabaseUrlOrThrow() {
    const dbUrl = process.env.DATABASE_URL?.trim() ?? '';
    if (!dbUrl) {
        throw new Error('DATABASE_URL is missing. Add a PostgreSQL connection string in .env');
    }
    const isPgUrl = /^postgres(ql)?:\/\//i.test(dbUrl);
    if (!isPgUrl) {
        throw new Error('DATABASE_URL is invalid. Expected PostgreSQL format: postgresql://user:pass@host:5432/db');
    }
}
// Validate environment configuration at startup.
function validateConfig() {
    validateDatabaseUrlOrThrow();
    const result = collectConfigValidation();
    if (result.missingRequired.length > 0) {
        console.warn(`Missing required environment variables: ${result.missingRequired.join(', ')}`);
    }
    if (result.missingOptional.length > 0) {
        console.warn(`Missing optional environment variables: ${result.missingOptional.join(', ')}`);
    }
}
//# sourceMappingURL=index.js.map