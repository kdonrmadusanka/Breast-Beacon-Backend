import express from "express";
import { check, param } from "express-validator";
import rateLimit from "express-rate-limit";
import { authenticate } from "../middlewares/auth.middleware.js";
import {
  getConversations,
  getMessages,
} from "../controllers/chat.controller.js";
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
    new winston.transports.File({ filename: "logs/chat-routes.log" }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

// Middleware to restrict access to patients or clinicians only
const restrictToPatientOrClinician = async (req, res, next) => {
  try {
    if (!["patient", "clinician"].includes(req.user.role)) {
      logger.warn("Unauthorized access attempt to chat route", {
        userId: req.user._id,
        role: req.user.role,
        ipAddress: req.ip,
      });

      // Create audit log for unauthorized access
      await AuditLog.create({
        userId: req.user._id,
        action: "unauthorized_chat_access",
        details: { email: req.user.email, role: req.user.role },
        ipAddress: req.ip,
        deviceInfo: req.headers["user-agent"] || "Unknown",
      });

      return res.status(403).json({
        status: "error",
        message: "Only patients and clinicians can access this resource",
        timestamp: new Date().toISOString(),
      });
    }
    next();
  } catch (error) {
    logger.error("Error in role restriction middleware", {
      userId: req.user._id,
      error: error.message,
    });
    next(error);
  }
};

// Rate limiter for chat routes
const chatRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    status: "error",
    message: "Too many chat requests, please try again later",
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation for recipientId parameter
const recipientValidation = [
  param("recipientId").isMongoId().withMessage("Invalid recipient ID"),
];

/**
 * @desc    Routes for chat conversations and messages
 * @route   /api/chats/*
 * @access  Private (patient or clinician)
 */
router.get(
  "/conversations",
  authenticate,
  restrictToPatientOrClinician,
  chatRateLimiter,
  async (req, res, next) => {
    try {
      // Log route access
      await AuditLog.create({
        userId: req.user._id,
        action: "conversations_access_attempt",
        details: { email: req.user.email },
        ipAddress: req.ip,
        deviceInfo: req.headers["user-agent"] || "Unknown",
      });
      logger.info("Conversations route accessed", {
        userId: req.user._id,
        ipAddress: req.ip,
      });

      // Call controller
      await getConversations(req, res, next);
    } catch (error) {
      logger.error("Conversations route error", {
        userId: req.user._id,
        error: error.message,
      });
      next(error);
    }
  }
);

router.get(
  "/messages/:recipientId",
  authenticate,
  restrictToPatientOrClinician,
  chatRateLimiter,
  recipientValidation,
  async (req, res, next) => {
    try {
      // Log route access
      await AuditLog.create({
        userId: req.user._id,
        action: "messages_access_attempt",
        details: { email: req.user.email, recipientId: req.params.recipientId },
        ipAddress: req.ip,
        deviceInfo: req.headers["user-agent"] || "Unknown",
      });
      logger.info("Messages route accessed", {
        userId: req.user._id,
        recipientId: req.params.recipientId,
        ipAddress: req.ip,
      });

      // Call controller
      await getMessages(req, res, next);
    } catch (error) {
      logger.error("Messages route error", {
        userId: req.user._id,
        recipientId: req.params.recipientId,
        error: error.message,
      });
      next(error);
    }
  }
);

export default router;
