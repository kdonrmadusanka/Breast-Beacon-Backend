/**
 * @swagger
 * components:
 *   schemas:
 *     Alert:
 *       type: object
 *       properties:
 *         alertId:
 *           type: string
 *         eventId:
 *           type: string
 *         alertType:
 *           type: string
 *           enum: [security, data, system, quality, compliance]
 *         severity:
 *           type: string
 *           enum: [critical, high, medium, low]
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         status:
 *           type: string
 *           enum: [open, acknowledged, resolved, suppressed]
 *         metadata:
 *           type: object
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         acknowledgedBy:
 *           type: string
 *         resolvedBy:
 *           type: string
 */

import Alert from "../models/Alert.js";
import Notification from "../models/Notification.js";
import { logSecurityEvent } from "./auditLogger.js";
import { sendEmail } from "./email_notification.service.js";

// Alert types and thresholds
const ALERT_CONFIG = {
  SECURITY: {
    failedLogin: { threshold: 5, windowMinutes: 30, severity: "high" },
    bruteForceAttempt: {
      threshold: 10,
      windowMinutes: 60,
      severity: "critical",
    },
    unauthorizedAccess: { severity: "critical" },
  },
  DATA: {
    largeExport: { thresholdMB: 100, severity: "medium" },
    modificationChain: { threshold: 3, windowMinutes: 10, severity: "high" },
  },
  SYSTEM: {
    highLoad: { threshold: 90, severity: "high" },
    storageCritical: { threshold: 95, severity: "critical" },
  },
  QUALITY: {
    imageQuality: { threshold: 60, severity: "medium" },
    aiDiscrepancy: { severity: "high" },
  },
};

// Recipient configuration
const RECIPIENTS = {
  security: ["breastbeacon@gmil.com"],
  data: ["breastbeacon@gmil.com"],
  system: ["breastbeacon@gmil.com"],
  quality: ["breastbeacon@gmil.com"],
};

/**
 * Create and dispatch an alert
 * @param {Object} params
 * @param {string} params.alertType - Type of alert
 * @param {string} params.severity - Severity level
 * @param {string} params.title - Alert title
 * @param {string} params.description - Alert description
 * @param {Object} [params.metadata] - Additional context
 * @param {string} [params.eventId] - Related event ID
 * @returns {Promise<Object>} Created alert
 */
export const createAlert = async ({
  alertType,
  severity,
  title,
  description,
  metadata = {},
  eventId,
}) => {
  try {
    // Create alert record
    const alert = new Alert({
      alertType,
      severity,
      title,
      description,
      metadata,
      eventId,
      status: "open",
    });

    await alert.save();

    // Determine recipients based on alert type
    const toAddresses = RECIPIENTS[alertType] || RECIPIENTS.security;

    // Send email notifications
    await sendEmail({
      to: toAddresses,
      subject: `[${severity.toUpperCase()}] ${title}`,
      body: `${description}\n\nDetails:\n${JSON.stringify(metadata, null, 2)}`,
    });

    // For critical alerts, also send SMS
    // if (severity === "critical") {
    //   await sendSms({
    //     to: process.env.ON_CALL_PHONE,
    //     body: `CRITICAL ALERT: ${title} - ${description.substring(0, 100)}...`,
    //   });
    // }

    // Log the alert creation
    await logSecurityEvent({
      action: "alert_created",
      status: "success",
      metadata: {
        alertId: alert._id,
        alertType,
        severity,
      },
    });

    return alert;
  } catch (error) {
    console.error("Alert creation failed:", error);
    await logSecurityEvent({
      action: "alert_failed",
      status: "failure",
      metadata: {
        error: error.message,
        alertType,
        title,
      },
    });
    throw error;
  }
};

/**
 * Process security events and trigger alerts when thresholds are exceeded
 * @param {Object} event - Security event
 * @returns {Promise<void>}
 */
export const processSecurityEvent = async (event) => {
  // Check for failed login patterns
  if (event.action === "login_failed") {
    const recentFailures = await Audit.countDocuments({
      eventType: "security",
      action: "login_failed",
      "metadata.username": event.metadata.username,
      timestamp: {
        $gte: new Date(
          Date.now() - ALERT_CONFIG.SECURITY.failedLogin.windowMinutes * 60000
        ),
      },
    });

    if (recentFailures >= ALERT_CONFIG.SECURITY.failedLogin.threshold) {
      await createAlert({
        alertType: "security",
        severity: ALERT_CONFIG.SECURITY.failedLogin.severity,
        title: "Multiple Failed Login Attempts",
        description: `User ${event.metadata.username} has ${recentFailures} failed login attempts in the last ${ALERT_CONFIG.SECURITY.failedLogin.windowMinutes} minutes.`,
        metadata: {
          username: event.metadata.username,
          attempts: recentFailures,
          lastAttempt: event.timestamp,
        },
        eventId: event._id,
      });
    }
  }

  // Check for unauthorized access
  if (event.action === "unauthorized_access") {
    await createAlert({
      alertType: "security",
      severity: ALERT_CONFIG.SECURITY.unauthorizedAccess.severity,
      title: "Unauthorized Access Attempt",
      description: `Attempt to access restricted resource by ${
        event.userId || "unknown user"
      }`,
      metadata: {
        resource: event.metadata.resource,
        action: event.metadata.action,
        ipAddress: event.metadata.ipAddress,
      },
      eventId: event._id,
    });
  }
};

/**
 * Process data events and trigger alerts
 * @param {Object} event - Data event
 * @returns {Promise<void>}
 */
export const processDataEvent = async (event) => {
  // Check for large data exports
  if (
    event.action === "data_export" &&
    event.metadata.sizeMB > ALERT_CONFIG.DATA.largeExport.thresholdMB
  ) {
    await createAlert({
      alertType: "data",
      severity: ALERT_CONFIG.DATA.largeExport.severity,
      title: "Large Data Export Detected",
      description: `User ${event.userId} exported ${event.metadata.sizeMB}MB of ${event.metadata.dataType} data.`,
      metadata: {
        userId: event.userId,
        sizeMB: event.metadata.sizeMB,
        dataType: event.metadata.dataType,
        destination: event.metadata.destination,
      },
      eventId: event._id,
    });
  }

  // Check for rapid sequence of modifications
  if (event.eventType === "modification") {
    const recentChanges = await Audit.countDocuments({
      eventType: "modification",
      userId: event.userId,
      entityType: event.entityType,
      timestamp: {
        $gte: new Date(
          Date.now() - ALERT_CONFIG.DATA.modificationChain.windowMinutes * 60000
        ),
      },
    });

    if (recentChanges >= ALERT_CONFIG.DATA.modificationChain.threshold) {
      await createAlert({
        alertType: "data",
        severity: ALERT_CONFIG.DATA.modificationChain.severity,
        title: "Rapid Data Modifications Detected",
        description: `User ${event.userId} made ${recentChanges} changes to ${event.entityType} in the last ${ALERT_CONFIG.DATA.modificationChain.windowMinutes} minutes.`,
        metadata: {
          userId: event.userId,
          entityType: event.entityType,
          changes: recentChanges,
        },
        eventId: event._id,
      });
    }
  }
};

/**
 * Process system metrics and trigger alerts
 * @param {Object} metrics - System metrics
 * @returns {Promise<void>}
 */
export const processSystemMetrics = async (metrics) => {
  // CPU load alert
  if (metrics.cpuLoad > ALERT_CONFIG.SYSTEM.highLoad.threshold) {
    await createAlert({
      alertType: "system",
      severity: ALERT_CONFIG.SYSTEM.highLoad.severity,
      title: "High CPU Load",
      description: `CPU load is at ${metrics.cpuLoad}%`,
      metadata: metrics,
    });
  }

  // Storage alert
  if (
    metrics.storageUsedPercent > ALERT_CONFIG.SYSTEM.storageCritical.threshold
  ) {
    await createAlert({
      alertType: "system",
      severity: ALERT_CONFIG.SYSTEM.storageCritical.severity,
      title: "Critical Storage Usage",
      description: `Storage usage is at ${metrics.storageUsedPercent}%`,
      metadata: metrics,
    });
  }
};

/**
 * Process quality events and trigger alerts
 * @param {Object} event - Quality event
 * @returns {Promise<void>}
 */
export const processQualityEvent = async (event) => {
  // Image quality alerts
  if (
    event.action === "image_processed" &&
    event.metadata.qualityScore < ALERT_CONFIG.QUALITY.imageQuality.threshold
  ) {
    await createAlert({
      alertType: "quality",
      severity: ALERT_CONFIG.QUALITY.imageQuality.severity,
      title: "Low Quality Image Detected",
      description: `Image ${event.metadata.imageId} scored ${event.metadata.qualityScore} (below threshold of ${ALERT_CONFIG.QUALITY.imageQuality.threshold})`,
      metadata: event.metadata,
      eventId: event._id,
    });
  }

  // AI-radiologist discrepancy
  if (event.action === "ai_discrepancy") {
    await createAlert({
      alertType: "quality",
      severity: ALERT_CONFIG.QUALITY.aiDiscrepancy.severity,
      title: "AI-Radiologist Discrepancy",
      description: `Significant discrepancy between AI and radiologist findings for case ${event.metadata.caseId}`,
      metadata: event.metadata,
      eventId: event._id,
    });
  }
};

/**
 * Acknowledge an alert
 * @param {string} alertId - ID of alert to acknowledge
 * @param {Object} user - User acknowledging the alert
 * @returns {Promise<Object>} Updated alert
 */
export const acknowledgeAlert = async (alertId, user) => {
  const alert = await Alert.findByIdAndUpdate(
    alertId,
    {
      status: "acknowledged",
      acknowledgedBy: user._id,
      updatedAt: new Date(),
    },
    { new: true }
  );

  await logSecurityEvent({
    action: "alert_acknowledged",
    user,
    metadata: {
      alertId,
      previousStatus: alert.status,
    },
  });

  return alert;
};

/**
 * Resolve an alert
 * @param {string} alertId - ID of alert to resolve
 * @param {Object} user - User resolving the alert
 * @param {string} [resolutionNotes] - Notes about resolution
 * @returns {Promise<Object>} Updated alert
 */
export const resolveAlert = async (alertId, user, resolutionNotes) => {
  const alert = await Alert.findByIdAndUpdate(
    alertId,
    {
      status: "resolved",
      resolvedBy: user._id,
      updatedAt: new Date(),
      $push: {
        "metadata.notes": resolutionNotes,
      },
    },
    { new: true }
  );

  await logSecurityEvent({
    action: "alert_resolved",
    user,
    metadata: {
      alertId,
      resolutionNotes,
    },
  });

  return alert;
};

/**
 * @swagger
 * /api/alerts:
 *   get:
 *     summary: Get active alerts
 *     tags: [Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, acknowledged, resolved, suppressed]
 *         description: Filter by alert status
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [critical, high, medium, low]
 *         description: Filter by severity
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [security, data, system, quality, compliance]
 *         description: Filter by alert type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum results to return
 *     responses:
 *       200:
 *         description: List of alerts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Alert'
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Server error
 */
export const getAlerts = async (req, res) => {
  try {
    // Only certain roles can view alerts
    if (!["admin", "security", "radiologist"].includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.severity) query.severity = req.query.severity;
    if (req.query.type) query.alertType = req.query.type;

    const alerts = await Alert.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(req.query.limit) || 50);

    res.json(alerts);
  } catch (error) {
    console.error("Failed to fetch alerts:", error);
    res.status(500).json({ error: "Failed to retrieve alerts" });
  }
};

/**
 * @swagger
 * /api/alerts/{alertId}/acknowledge:
 *   post:
 *     summary: Acknowledge an alert
 *     tags: [Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alertId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of alert to acknowledge
 *     responses:
 *       200:
 *         description: Alert acknowledged
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Alert'
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Alert not found
 *       500:
 *         description: Server error
 */
export const acknowledgeAlertRoute = async (req, res) => {
  try {
    const alert = await acknowledgeAlert(req.params.alertId, req.user);
    res.json(alert);
  } catch (error) {
    console.error("Failed to acknowledge alert:", error);
    res.status(500).json({ error: "Failed to acknowledge alert" });
  }
};

// Initialize alert processing by setting up listeners
export const initAlertSystem = () => {
  // In a real implementation, you would set up event listeners:
  // eventBus.on('security_event', processSecurityEvent);
  // eventBus.on('data_event', processDataEvent);
  // eventBus.on('system_metrics', processSystemMetrics);
  // eventBus.on('quality_event', processQualityEvent);

  console.log("Alert system initialized");
};
