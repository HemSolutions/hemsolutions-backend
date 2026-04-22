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
(0, domainEventBootstrap_1.installDomainEventHandlers)();
// Initialize express app
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
let databaseStatus = 'disconnected';
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
// Rate limiting + request timeout (API only)
app.use('/api/', (0, requestTimeout_1.requestTimeoutMiddleware)(15_000));
app.use('/api/', rateLimit_1.apiRateLimiter);
// Body parsing
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
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
        database: databaseStatus,
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
const PORT = config_1.config.server.port;
async function bootstrap() {
    // Step 1: validate env
    (0, config_1.validateConfig)();
    // Step 2 + 3: DB connection + required objects verification
    await (0, client_1.verifyDatabaseReadiness)();
    databaseStatus = 'connected';
    // Step 4: start server
    (0, jobQueue_1.startBackgroundJobWorker)();
    httpServer.listen(PORT, () => {
        logger_1.logger.warn('✅ SERVER READY FOR PRODUCTION');
        logger_1.logger.warn(`Health endpoint: /health (port ${PORT})`);
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
process.on('SIGTERM', () => {
    logger_1.logger.warn('SIGTERM received. Shutting down gracefully...');
    httpServer.close(() => {
        logger_1.logger.warn('Server closed');
        process.exit(0);
    });
});
process.on('SIGINT', () => {
    logger_1.logger.warn('SIGINT received. Shutting down gracefully...');
    httpServer.close(() => {
        logger_1.logger.warn('Server closed');
        process.exit(0);
    });
});
process.on('unhandledRejection', (reason) => {
    logger_1.logger.error('Unhandled promise rejection', reason);
});
process.on('uncaughtException', (err) => {
    logger_1.logger.error('Uncaught exception', err);
});
void bootstrap().catch((err) => {
    logger_1.logger.error('Server bootstrap failed. Exiting process.', err);
    process.exit(1);
});
//# sourceMappingURL=server.js.map