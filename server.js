import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import helmet from "helmet";
import winston from "winston";
import { cleanEnv, str, url, num } from "envalid";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync, existsSync } from "fs";
import { errorHandler } from "./utils/errorHandler.js";
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import mammogramRoutes from "./routes/mammogram.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import envConfig from "./config/env.js";
import { createServer } from "http";
import { Server } from "socket.io";
import { initializeChatSocket } from "./controllers/chat.controller.js";

// Create logs directory if it doesn't exist
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const logsDir = join(__dirname, "logs");

if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

// Configure Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: join(logsDir, "error.log"),
      level: "error",
    }),
    new winston.transports.File({
      filename: join(logsDir, "combined.log"),
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          ({ level, message, timestamp, stack }) =>
            `${timestamp} ${level}: ${message}${stack ? `\n${stack}` : ""}`
        )
      ),
    }),
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: join(logsDir, "rejections.log") }),
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: join(logsDir, "exceptions.log") }),
  ],
});

// Load and validate environment variables
dotenv.config();
const env = cleanEnv(
  process.env,
  {
    MONGODB_URI: str({ desc: "MongoDB connection URI" }),
    JWT_SECRET: str({ desc: "JWT secret key" }),
    EMAIL_USER: str({ desc: "Email service user", default: "" }),
    EMAIL_PASS: str({ desc: "Email service password", default: "" }),
    FRONTEND_URL: url({
      desc: "Frontend application URL",
      default: "http://localhost:3000",
    }),
    PORT: num({ default: 5000, desc: "Server port" }),
    NODE_ENV: str({
      choices: ["development", "production", "test"],
      default: "development",
      desc: "Application environment",
    }),
    LOG_LEVEL: str({
      choices: ["error", "warn", "info", "verbose", "debug", "silly"],
      default: "info",
      desc: "Logging level",
    }),
  },
  {
    strict: true,
    reporter: ({ errors }) => {
      if (Object.keys(errors).length > 0) {
        logger.error("Environment variable validation failed", { errors });
        process.exit(1);
      }
    },
  }
);

const app = express();

console.log(envConfig.PORT);

// Middleware
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Authorization"],
  })
);
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());
app.use(
  morgan(env.NODE_ENV === "development" ? "dev" : "combined", {
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  })
);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", env.FRONTEND_URL],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    frameguard: { action: "deny" },
    xssFilter: true,
    noSniff: true,
    hidePoweredBy: true,
  })
);

// Database connection
mongoose.set("strictQuery", true);
mongoose
  .connect(env.MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
  })
  .then(() => logger.info("Connected to MongoDB"))
  .catch((err) => {
    logger.error("MongoDB connection error", { error: err.message });
    process.exit(1);
  });

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/mammograms", mammogramRoutes);
app.use("/api/chats", chatRoutes);

/**
 * @desc    Health check endpoint
 * @route   GET /health
 * @access  Public
 */
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    memoryUsage: process.memoryUsage(),
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Resource not found",
  });
});

// Error handling
app.use(errorHandler);

// Create HTTP server and Socket.IO server
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});
initializeChatSocket(io);

server.listen(env.PORT, () => {
  logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`, { stack: err.stack });
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  logger.error(`Uncaught Exception: ${err.message}`, { stack: err.stack });
  server.close(() => process.exit(1));
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received. Shutting down gracefully...");
  server.close(() => {
    mongoose.connection.close(false).then(() => {
      logger.info("MongoDB connection closed");
      process.exit(0);
    });
  });
});
