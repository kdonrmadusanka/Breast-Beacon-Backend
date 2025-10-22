import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import connectDB from './config/db.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import contactRoutes from './routes/contact.routes.js';
import caseRoutes from './routes/case.routes.js';
import reportRoutes from './routes/report.routes.js';
import templateRoutes from './routes/template.routes.js';
import annotationRoutes from './routes/annotation.routes.js';
import exportRoutes from './routes/export.routes.js';

// Middleware imports
import socketMiddleware from './middleware/socketMiddleware.js';
import { authenticateSocket } from './middleware/authMiddleware.js';
import { errorHandler, notFound } from './middleware/errorMiddleware.js';

// Services
import { testEmailConnection } from './utils/emailService.js';
import { SocketService, EventTypes } from './services/SocketService.js';

// Load environment variables from .env file
dotenv.config();

// Initialize express app
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO with enhanced configuration
const io = new SocketServer(server, {
  cors: {
    origin: process.env.CLIENT_URL?.split(',') || [
      'http://localhost:4200',
      'http://localhost:3000',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  maxHttpBufferSize: 1e8, // 100MB for file uploads
  transports: ['websocket', 'polling'],
});

// Initialize Socket Service
const socketService = new SocketService(server, {
  cors: {
    origin: process.env.CLIENT_URL?.split(',') || [
      'http://localhost:4200',
      'http://localhost:3000',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
});

// Middleware to parse incoming JSON with increased limit for file uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Enable CORS for cross-origin requests
app.use(
  cors({
    origin: process.env.CLIENT_URL?.split(',') || [
      'http://localhost:4200',
      'http://localhost:3000',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Socket-ID',
    ],
  }),
);

// Security middleware
app.use((req, res, next) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains',
  );

  // Socket ID header for request correlation
  if (req.headers['x-socket-id']) {
    req.socketId = req.headers['x-socket-id'];
  }

  next();
});

// Request logging middleware
app.use((req, res, next) => {
  console.log(
    `${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip}`,
  );
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV,
  });
});

// API status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'operational',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    connectedUsers: socketService.getConnectedUsersCount(),
    features: {
      realTime: true,
      fileUpload: true,
      collaboration: true,
      notifications: true,
    },
  });
});

// Connect to MongoDB
connectDB();

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/cases', caseRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/annotations', annotationRoutes);
app.use('/api/export', exportRoutes);

// Socket.IO Middleware and Event Handlers
io.use(socketMiddleware.authenticateSocket);
io.use(socketMiddleware.validateSession);
io.use(socketMiddleware.logConnection);

// Socket.IO Connection Handling
io.on('connection', (socket) => {
  console.log(
    `🔗 User ${socket.user.name} (${socket.user.id}) connected with socket ${socket.id}`,
  );

  // Join user to their personal room
  socket.join(`user:${socket.user.id}`);

  // Join role-based room
  socket.join(`role:${socket.user.role}`);

  // Join department room if applicable
  if (socket.user.department) {
    socket.join(`department:${socket.user.department}`);
  }

  // Handle room joining requests
  socket.on('join-room', (roomId, callback) => {
    try {
      socketMiddleware.handleJoinRoom(socket, roomId);
      if (callback) callback({ success: true, roomId });
    } catch (error) {
      if (callback) callback({ success: false, error: error.message });
    }
  });

  // Handle room leaving requests
  socket.on('leave-room', (roomId, callback) => {
    try {
      socketMiddleware.handleLeaveRoom(socket, roomId);
      if (callback) callback({ success: true, roomId });
    } catch (error) {
      if (callback) callback({ success: false, error: error.message });
    }
  });

  // User activity tracking
  socket.on('user-activity', (activity) => {
    socketMiddleware.handleUserActivity(socket, activity);
  });

  // Real-time collaboration events
  socket.on('start-collaboration', (data) => {
    socketMiddleware.rateLimitEvent('start-collaboration', 5, 30000)(
      socket,
      () => {},
      data,
    );
    socketMiddleware.handleStartCollaboration(socket, data);
  });

  socket.on('share-annotation', (data) => {
    socketMiddleware.rateLimitEvent('share-annotation', 10, 60000)(
      socket,
      () => {},
      data,
    );
    socketMiddleware.handleShareAnnotation(socket, data);
  });

  // Notification events
  socket.on('mark-notification-read', (notificationId) => {
    socketMiddleware.handleMarkNotificationRead(socket, notificationId);
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(
      `🔌 User ${socket.user.name} (${socket.user.id}) disconnected: ${reason}`,
    );
    socketMiddleware.handleDisconnection(socket, reason);
  });

  // Error handling
  socket.on('error', (error) => {
    socketMiddleware.handleSocketError(socket, error);
  });

  // Send connection confirmation
  socket.emit('connected', {
    message: 'Successfully connected to real-time service',
    userId: socket.user.id,
    socketId: socket.id,
    timestamp: new Date().toISOString(),
    user: {
      id: socket.user.id,
      name: socket.user.name,
      role: socket.user.role,
      department: socket.user.department,
    },
  });
});

// Apply Socket Service to Express app for use in controllers
app.set('socketService', socketService);

// Default route
app.get('/', (req, res) => {
  res.json({
    message: 'Radiology Information System API',
    version: '1.0.0',
    documentation: '/api/docs',
    status: 'operational',
    timestamp: new Date().toISOString(),
  });
});

// API documentation route
app.get('/api/docs', (req, res) => {
  res.json({
    name: 'Radiology Information System API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      cases: '/api/cases',
      reports: '/api/reports',
      templates: '/api/templates',
      annotations: '/api/annotations',
      export: '/api/export',
    },
    websockets: {
      events: Object.values(EventTypes),
      authentication: 'Required (JWT Bearer Token)',
    },
  });
});

// 404 handler for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
});

// Global error handling middleware
app.use(notFound);
app.use(errorHandler);

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, starting graceful shutdown');
  server.close(() => {
    console.log('HTTP server closed');
    socketService.cleanup();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, starting graceful shutdown');
  server.close(() => {
    console.log('HTTP server closed');
    socketService.cleanup();
    process.exit(0);
  });
});

// Unhandled rejection handler
process.on('unhandledRejection', (err, promise) => {
  console.error('Unhandled Promise Rejection:', err);
  console.error('At promise:', promise);
  // Close server & exit process
  server.close(() => {
    process.exit(1);
  });
});

// Uncaught exception handler
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  server.close(() => {
    process.exit(1);
  });
});

// Define PORT and start server
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`
🚀 Radiology Information System Server Started!
📍 Port: ${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'development'}
📡 Socket Service: Active
🗄️  Database: ${process.env.MONGODB_URI ? 'Connected' : 'Not configured'}
⏰ Started at: ${new Date().toISOString()}
  `);

  // Test email service connection
  testEmailConnection()
    .then(() => console.log('📧 Email service: Ready'))
    .catch((err) => console.error('📧 Email service: Failed -', err.message));

  // Log socket service status
  console.log(
    '🔌 Socket.IO service initialized with CORS:',
    process.env.CLIENT_URL?.split(',') || [
      'http://localhost:4200',
      'http://localhost:3000',
    ],
  );
});

export { app, server, io, socketService };
