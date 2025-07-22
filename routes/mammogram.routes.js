import express from "express";
import { check } from "express-validator";
import rateLimit from "express-rate-limit";
import { authenticate } from "../middlewares/auth.middleware.js";
import {
  uploadMammogram,
  getMammograms,
} from "../controllers/mammogram.controller.js";
import { AuditLog } from "../models/User.model.js";
import winston from "winston";

const router = express.Router();

// Configure Winston logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "logs/mammogram-routes.log" }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

// Middleware to restrict access to patients only
const restrictToPatient = async (req, res, next) => {
  try {
    if (req.user.role !== "patient") {
      logger.warn("Unauthorized access attempt to mammogram route", {
        userId: req.user._id,
        role: req.user.role,
        ipAddress: req.ip,
      });

      // Create audit log for unauthorized access
      await AuditLog.create({
        userId: req.user._id,
        action: "unauthorized_mammogram_access",
        details: { email: req.user.email, role: req.user.role },
        ipAddress: req.ip,
        deviceInfo: req.headers["user-agent"] || "Unknown",
      });

      return res.status(403).json({
        status: "error",
        message: "Only patients can access this resource",
        timestamp: new Date().toISOString(),
      });
    }
    next();
  } catch (error) {
    logger.error("Error in patient restriction middleware", {
      userId: req.user._id,
      error: error.message,
    });
    next(error);
  }
};

// Rate limiter for upload route
const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: {
    status: "error",
    message: "Too many upload requests, please try again later",
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation for mammogram upload
const uploadValidation = [
  check("mammogram").custom((value, { req }) => {
    if (!req.file) {
      throw new Error("Mammogram file is required");
    }
    return true;
  }),
];

/**
 * @desc    Routes for mammogram uploads and retrieval
 * @route   /api/mammograms/*
 * @access  Private (patient only)
 */
router.post(
  "/upload",
  authenticate,
  restrictToPatient,
  uploadRateLimiter,
  uploadValidation,
  async (req, res, next) => {
    try {
      // Log route access
      await AuditLog.create({
        userId: req.user._id,
        action: "mammogram_upload_attempt",
        details: { email: req.user.email },
        ipAddress: req.ip,
        deviceInfo: req.headers["user-agent"] || "Unknown",
      });
      logger.info("Mammogram upload route accessed", {
        userId: req.user._id,
        ipAddress: req.ip,
      });

      // Call controller
      await uploadMammogram(req, res, next);
    } catch (error) {
      logger.error("Mammogram upload route error", {
        userId: req.user._id,
        error: error.message,
      });
      next(error);
    }
  }
);

router.get("/", authenticate, restrictToPatient, async (req, res, next) => {
  try {
    // Log route access
    await AuditLog.create({
      userId: req.user._id,
      action: "mammogram_retrieval_attempt",
      details: { email: req.user.email },
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    logger.info("Mammogram retrieval route accessed", {
      userId: req.user._id,
      ipAddress: req.ip,
    });

    // Call controller
    await getMammograms(req, res, next);
  } catch (error) {
    logger.error("Mammogram retrieval route error", {
      userId: req.user._id,
      error: error.message,
    });
    next(error);
  }
});

export default router;
