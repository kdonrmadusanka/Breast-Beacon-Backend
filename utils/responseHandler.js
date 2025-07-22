import winston from "winston";
import { AuditLog } from "../models/User.model.js";

// Configure Winston logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "logs/response.log" }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

/**
 * @desc    Formats and sends a success response with optional audit logging
 * @param {Object} res - Express response object
 * @param {Object|null} data - Response data (e.g., user, tokens)
 * @param {string} message - Success message
 * @param {number} [statusCode=200] - HTTP status code
 * @param {Object} [req] - Express request object for audit logging (optional)
 * @param {string} [auditAction] - Audit log action type (optional)
 * @returns {Object} JSON response
 */
const successResponse = async (
  res,
  data,
  message,
  statusCode = 200,
  req = null,
  auditAction = null
) => {
  try {
    const response = {
      status: "success",
      message,
      data: data || null,
      timestamp: new Date().toISOString(),
    };

    // Create audit log for sensitive actions if req and auditAction are provided
    if (req && auditAction && req.user?._id) {
      await AuditLog.create({
        userId: req.user._id,
        action: auditAction,
        details: {
          email: req.user.email,
          message,
          statusCode,
        },
        ipAddress: req.ip || "unknown",
        deviceInfo: req.headers["user-agent"] || "Unknown",
      });
      logger.info(`Audit log created for ${auditAction}`, {
        userId: req.user._id,
        ipAddress: req.ip,
        deviceInfo: req.headers["user-agent"] || "Unknown",
      });
    }

    logger.info("Success response sent", {
      statusCode,
      message,
      userId: req?.user?._id || "unknown",
      ipAddress: req?.ip || "unknown",
    });

    return res.status(statusCode).json(response);
  } catch (error) {
    logger.error("Failed to send success response", {
      message,
      userId: req?.user?._id || "unknown",
      error: error.message,
    });
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * @desc    Formats and sends an error response with logging
 * @param {Object} res - Express response object
 * @param {Object} error - Error object (e.g., AppError)
 * @param {Object} [req] - Express request object for logging (optional)
 * @returns {Object} JSON response
 */
const errorResponse = (res, error, req = null) => {
  const statusCode = error.statusCode || 500;
  const message = error.message || "Internal server error";
  const errorDetails =
    process.env.NODE_ENV === "production" ? undefined : error.stack;

  logger.error("Error response sent", {
    statusCode,
    message,
    userId: req?.user?._id || "unknown",
    ipAddress: req?.ip || "unknown",
    deviceInfo: req?.headers?.["user-agent"] || "Unknown",
    error: errorDetails || error.message,
  });

  return res.status(statusCode).json({
    status: "error",
    message,
    error: errorDetails,
    timestamp: new Date().toISOString(),
  });
};

export { successResponse, errorResponse };
