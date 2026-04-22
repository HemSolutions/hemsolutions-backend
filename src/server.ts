import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { createServer, Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { config, validateConfig } from './config';
import { errorHandler } from './middleware/errorHandler';
import { apiRateLimiter } from './middleware/rateLimit';
import { requestTimeoutMiddleware } from './middleware/requestTimeout';
import { startBackgroundJobWorker } from './services/jobs/jobQueue';

// Routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import serviceRoutes from './routes/services';
import bookingRoutes from './routes/bookings';
import invoiceRoutes from './routes/invoices';
import messageRoutes from './routes/messages';
import notificationRoutes from './routes/notifications';
import adminRoutes from './routes/admin';
import webhookRoutes from './routes/webhooks';
import compatRoutes from './routes/compat';
import { installDomainEventHandlers } from './domain/domainEventBootstrap';
import { registerAdminRefreshApp } from './services/automation/adminRefreshBridge';
import { verifyDatabaseReadiness } from './prisma/client';
import { logger } from './utils/logger';

installDomainEventHandlers();

// Initialize express app
const app: Application = express();
const httpServer: Server = createServer(app);
let databaseStatus: 'connected' | 'disconnected' = 'disconnected';

// Initialize Socket.IO
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: config.frontend.url,
    credentials: true
  }
});

// Store io instance for use in controllers
app.set('io', io);
registerAdminRefreshApp(app);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors({
  origin: config.frontend.url,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting + request timeout (API only)
app.use('/api/', requestTimeoutMiddleware(15_000));
app.use('/api/', apiRateLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Logging
if (config.server.isDevelopment) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    database: databaseStatus,
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/compat', compatRoutes);
app.use('/webhooks', webhookRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Resource not found'
  });
});

// Global error handler
app.use(errorHandler);

// Socket.IO connection handling
io.on('connection', (socket) => {
  if (config.server.isDevelopment) {
    logger.info('Client connected', { socketId: socket.id });
  }

  // Join booking room
  socket.on('join_booking', (bookingId: string) => {
    socket.join(`booking:${bookingId}`);
  });

  // Leave booking room
  socket.on('leave_booking', (bookingId: string) => {
    socket.leave(`booking:${bookingId}`);
  });

  // Handle typing indicator
  socket.on('typing', (data: { bookingId: string; userId: string }) => {
    socket.to(`booking:${data.bookingId}`).emit('typing', {
      userId: data.userId
    });
  });

  socket.on('disconnect', () => {
    /* quiet in production */
  });
});

// Start server
const PORT = config.server.port;

async function bootstrap(): Promise<void> {
  // Step 1: validate env
  validateConfig();
  // Step 2 + 3: DB connection + required objects verification
  await verifyDatabaseReadiness();
  databaseStatus = 'connected';
  // Step 4: start server
  startBackgroundJobWorker();
  httpServer.listen(PORT, () => {
    logger.warn('✅ SERVER READY FOR PRODUCTION');
    logger.warn(`Health endpoint: /health (port ${PORT})`);
    if (config.server.isDevelopment) {
      logger.info('Server started', {
        port: PORT,
        nodeEnv: config.server.nodeEnv,
        health: `http://localhost:${PORT}/health`,
      });
    }
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.warn('SIGTERM received. Shutting down gracefully...');
  httpServer.close(() => {
    logger.warn('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.warn('SIGINT received. Shutting down gracefully...');
  httpServer.close(() => {
    logger.warn('Server closed');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err);
});

void bootstrap().catch((err) => {
  logger.error('Server bootstrap failed. Exiting process.', err);
  process.exit(1);
});
