import winston from "winston";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync, existsSync } from "fs";

// Ensure logs directory exists
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const logsDir = join(__dirname, "../logs");

if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

// Configure Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "error",
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

/**
 * Custom application error class
 * @class
 * @extends Error
 */
export class AppError extends Error {
  /**
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {Object} [details] - Additional error details (optional)
   */
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = true;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error handling middleware for Express
 * @param {Error} err - The error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
export const errorHandler = (err, req, res, next) => {
  // Determine error type and status code
  const isOperationalError = err instanceof AppError;
  const statusCode = err.statusCode || (isOperationalError ? 400 : 500);
  const message = err.message || "Internal Server Error";

  // Log error with request context
  logger.error({
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
    },
    context: {
      statusCode,
      isOperational: isOperationalError,
      request: {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        user: req.user ? req.user._id : "unauthenticated",
        body: process.env.NODE_ENV === "development" ? req.body : undefined,
      },
    },
    timestamp: new Date().toISOString(),
  });

  // Prepare response
  const response = {
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && {
      error: {
        name: err.name,
        stack: err.stack,
        details: err.details || null,
      },
    }),
  };

  // Send response
  res.status(statusCode).json(response);
};

/**
 * Send success response
 * @param {Object} res - Express response object
 * @param {Object|null} data - Response data
 * @param {string} [message="Success"] - Success message
 * @param {number} [statusCode=200] - HTTP status code
 */
export const successResponse = (
  res,
  data = null,
  message = "Success",
  statusCode = 200
) => {
  res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * Send error response
 * @param {Object} res - Express response object
 * @param {string} [message="Error occurred"] - Error message
 * @param {number} [statusCode=400] - HTTP status code
 * @param {Object} [error=null] - Error details
 */
export const errorResponse = (
  res,
  message = "Error occurred",
  statusCode = 400,
  error = null
) => {
  const response = {
    success: false,
    message,
    ...(process.env.NODE_ENV === "development" && { error }),
  };

  // Log the error if it's a server error (500)
  if (statusCode >= 500) {
    logger.error(response);
  }

  res.status(statusCode).json(response);
};
