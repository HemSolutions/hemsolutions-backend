import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { createServer, Server } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { config, validateConfig } from './config';
import { env } from './config/env';
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
import { prisma } from './prisma/client';
import { logger } from './utils/logger';
import { requestTracing } from './middleware/requestTracing';
import { cacheStatus } from './services/cache';

installDomainEventHandlers();

const allowedOrigins = (
  process.env.FRONTEND_URLS ||
  process.env.FRONTEND_URL ||
  'https://www.hemsolutions.se,http://localhost:5173'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Initialize express app
const app: Application = express();
const httpServer: Server = createServer(app);
let dbStatus = false;
const DB_RETRIES_MS = [1000, 2000, 5000];

async function connectDB(): Promise<boolean> {
  for (let i = 0; i < DB_RETRIES_MS.length; i += 1) {
    try {
      await prisma.$connect();
      logger.info('Database connected', { attempt: i + 1 });
      return true;
    } catch (err) {
      logger.warn('Database connection attempt failed', { attempt: i + 1, error: err });
      await new Promise((resolve) => setTimeout(resolve, DB_RETRIES_MS[i]));
    }
  }
  logger.error('Database unavailable after retries; running in degraded mode');
  return false;
}

// Initialize Socket.IO
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: allowedOrigins,
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
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(requestTracing);
app.use(requestTimeoutMiddleware(15_000));
app.use(apiRateLimiter);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

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
    uptime: process.uptime(),
  });
});

app.get('/ready', (_req: Request, res: Response) => {
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

app.get('/metrics-lite', (_req: Request, res: Response) => {
  res.json({
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    dbStatus: dbStatus ? 'connected' : 'disconnected',
    cacheStatus,
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
const PORT = env.PORT;

function bootstrap(): void {
  if (!process.env.JWT_SECRET) {
    logger.warn('Missing JWT_SECRET');
  }

  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'production';
  }

  // Validate env but do not block startup in resilient mode.
  try {
    validateConfig();
  } catch (err) {
    logger.warn('Environment validation warning', { error: err });
  }

  startBackgroundJobWorker();
  httpServer.listen(Number(PORT), '0.0.0.0', async () => {
    logger.info('Server started', { port: PORT, host: '0.0.0.0' });
    logger.info('SERVER READY FOR PRODUCTION');
    dbStatus = await connectDB();
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
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received');
  try {
    await prisma.$disconnect();
    logger.info('DB disconnected');
  } catch (e) {
    logger.warn('DB disconnect failed', { error: e });
  }
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received');
  try {
    await prisma.$disconnect();
    logger.info('DB disconnected');
  } catch (e) {
    logger.warn('DB disconnect failed', { error: e });
  }
  httpServer.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  logger.error('[FATAL] Uncaught Exception', { error: err });
});

process.on('unhandledRejection', (err) => {
  logger.error('[FATAL] Unhandled Rejection', { error: err });
});

bootstrap();
