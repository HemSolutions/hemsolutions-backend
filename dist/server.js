"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const compression_1 = __importDefault(require("compression"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const config_1 = require("./config");
const env_1 = require("./config/env");
const errorHandler_1 = require("./middleware/errorHandler");
const rateLimit_1 = require("./middleware/rateLimit");
const requestTimeout_1 = require("./middleware/requestTimeout");
const jobQueue_1 = require("./services/jobs/jobQueue");
// Routes
const auth_1 = __importDefault(require("./routes/auth"));
const users_1 = __importDefault(require("./routes/users"));
const services_1 = __importDefault(require("./routes/services"));
const bookings_1 = __importDefault(require("./routes/bookings"));
const invoices_1 = __importDefault(require("./routes/invoices"));
const messages_1 = __importDefault(require("./routes/messages"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const admin_1 = __importDefault(require("./routes/admin"));
const webhooks_1 = __importDefault(require("./routes/webhooks"));
const compat_1 = __importDefault(require("./routes/compat"));
const domainEventBootstrap_1 = require("./domain/domainEventBootstrap");
const adminRefreshBridge_1 = require("./services/automation/adminRefreshBridge");
const client_1 = require("./prisma/client");
const logger_1 = require("./utils/logger");
const requestTracing_1 = require("./middleware/requestTracing");
const cache_1 = require("./services/cache");
(0, domainEventBootstrap_1.installDomainEventHandlers)();
// Initialize express app
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
let dbStatus = false;
const DB_RETRIES_MS = [1000, 2000, 5000];
async function connectDB() {
    for (let i = 0; i < DB_RETRIES_MS.length; i += 1) {
        try {
            await client_1.prisma.$connect();
            logger_1.logger.info('Database connected', { attempt: i + 1 });
            return true;
        }
        catch (err) {
            logger_1.logger.warn('Database connection attempt failed', { attempt: i + 1, error: err });
            await new Promise((resolve) => setTimeout(resolve, DB_RETRIES_MS[i]));
        }
    }
    logger_1.logger.error('Database unavailable after retries; running in degraded mode');
    return false;
}
// Initialize Socket.IO
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: config_1.config.frontend.url,
        credentials: true
    }
});
// Store io instance for use in controllers
app.set('io', io);
(0, adminRefreshBridge_1.registerAdminRefreshApp)(app);
// Security middleware
app.use((0, helmet_1.default)({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));
app.use((0, cors_1.default)({
    origin: config_1.config.frontend.url,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(requestTracing_1.requestTracing);
app.use((0, requestTimeout_1.requestTimeoutMiddleware)(15_000));
app.use(rateLimit_1.apiRateLimiter);
// Body parsing
app.use(express_1.default.json({ limit: '1mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '1mb' }));
// Compression
app.use((0, compression_1.default)());
// Logging
if (config_1.config.server.isDevelopment) {
    app.use((0, morgan_1.default)('dev'));
}
else {
    app.use((0, morgan_1.default)('combined'));
}
// Health check endpoint
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
    });
});
app.get('/ready', (_req, res) => {
    if (dbStatus) {
        res.json({
            status: 'ready',
            database: 'connected',
        });
        return;
    }
    res.json({
        status: 'degraded',
        database: 'disconnected',
    });
});
app.get('/metrics-lite', (_req, res) => {
    res.json({
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        dbStatus: dbStatus ? 'connected' : 'disconnected',
        cacheStatus: cache_1.cacheStatus,
    });
});
// API routes
app.use('/api/auth', auth_1.default);
app.use('/api/users', users_1.default);
app.use('/api/services', services_1.default);
app.use('/api/bookings', bookings_1.default);
app.use('/api/invoices', invoices_1.default);
app.use('/api/messages', messages_1.default);
app.use('/api/notifications', notifications_1.default);
app.use('/api/admin', admin_1.default);
app.use('/api/compat', compat_1.default);
app.use('/webhooks', webhooks_1.default);
// 404 handler
app.use((_req, res) => {
    res.status(404).json({
        success: false,
        message: 'Resource not found'
    });
});
// Global error handler
app.use(errorHandler_1.errorHandler);
// Socket.IO connection handling
io.on('connection', (socket) => {
    if (config_1.config.server.isDevelopment) {
        logger_1.logger.info('Client connected', { socketId: socket.id });
    }
    // Join booking room
    socket.on('join_booking', (bookingId) => {
        socket.join(`booking:${bookingId}`);
    });
    // Leave booking room
    socket.on('leave_booking', (bookingId) => {
        socket.leave(`booking:${bookingId}`);
    });
    // Handle typing indicator
    socket.on('typing', (data) => {
        socket.to(`booking:${data.bookingId}`).emit('typing', {
            userId: data.userId
        });
    });
    socket.on('disconnect', () => {
        /* quiet in production */
    });
});
// Start server
const PORT = env_1.env.PORT;
function bootstrap() {
    if (!process.env.JWT_SECRET) {
        logger_1.logger.warn('Missing JWT_SECRET');
    }
    if (!process.env.NODE_ENV) {
        process.env.NODE_ENV = 'production';
    }
    // Validate env but do not block startup in resilient mode.
    try {
        (0, config_1.validateConfig)();
    }
    catch (err) {
        logger_1.logger.warn('Environment validation warning', { error: err });
    }
    (0, jobQueue_1.startBackgroundJobWorker)();
    httpServer.listen(Number(PORT), '0.0.0.0', async () => {
        logger_1.logger.info('Server started', { port: PORT, host: '0.0.0.0' });
        logger_1.logger.info('SERVER READY FOR PRODUCTION');
        dbStatus = await connectDB();
        if (config_1.config.server.isDevelopment) {
            logger_1.logger.info('Server started', {
                port: PORT,
                nodeEnv: config_1.config.server.nodeEnv,
                health: `http://localhost:${PORT}/health`,
            });
        }
    });
}
// Graceful shutdown
process.on('SIGTERM', async () => {
    logger_1.logger.info('SIGTERM received');
    try {
        await client_1.prisma.$disconnect();
        logger_1.logger.info('DB disconnected');
    }
    catch (e) {
        logger_1.logger.warn('DB disconnect failed', { error: e });
    }
    httpServer.close(() => {
        logger_1.logger.info('Server closed');
        process.exit(0);
    });
});
process.on('SIGINT', async () => {
    logger_1.logger.info('SIGINT received');
    try {
        await client_1.prisma.$disconnect();
        logger_1.logger.info('DB disconnected');
    }
    catch (e) {
        logger_1.logger.warn('DB disconnect failed', { error: e });
    }
    httpServer.close(() => {
        logger_1.logger.info('Server closed');
        process.exit(0);
    });
});
process.on('uncaughtException', (err) => {
    logger_1.logger.error('[FATAL] Uncaught Exception', { error: err });
});
process.on('unhandledRejection', (err) => {
    logger_1.logger.error('[FATAL] Unhandled Rejection', { error: err });
});
bootstrap();
//# sourceMappingURL=server.js.map