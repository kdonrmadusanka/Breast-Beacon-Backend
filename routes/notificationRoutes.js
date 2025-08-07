import express from "express";
import {
  sendResultsNotification,
  sendFollowUpReminder,
} from "../services/notificationService.js";

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Notification:
 *       type: object
 *       properties:
 *         patientId:
 *           type: string
 *         mammogramId:
 *           type: string
 *         channel:
 *           type: string
 *           enum: [email, letter, portal]
 *         status:
 *           type: string
 *           enum: [pending, sent, delivered, failed]
 *         content:
 *           type: object
 *           properties:
 *             subject:
 *               type: string
 *             body:
 *               type: string
 *             attachments:
 *               type: array
 *               items:
 *                 type: string
 *         auditLog:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               timestamp:
 *                 type: string
 *               event:
 *                 type: string
 *               details:
 *                 type: string
 */

/**
 * @swagger
 * /api/notifications/results/{mammogramId}:
 *   post:
 *     summary: Send results notification
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: mammogramId
 *         required: true
 *         schema:
 *           type: string
 *         description: Mammogram ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               channel:
 *                 type: string
 *                 enum: [email, portal]
 *                 default: portal
 *     responses:
 *       200:
 *         description: Notification sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 notificationId:
 *                   type: string
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Mammogram not found
 *       500:
 *         description: Notification failed
 */
router.post("/results/:mammogramId", async (req, res) => {
  try {
    const { mammogramId } = req.params;
    const { channel = "portal" } = req.body;

    const result = await sendResultsNotification(mammogramId, channel);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error("Notification error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/notifications/reminders/{appointmentId}:
 *   post:
 *     summary: Send follow-up reminder
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Appointment ID
 *     responses:
 *       200:
 *         description: Reminder sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 notificationId:
 *                   type: string
 *       404:
 *         description: Appointment not found
 *       500:
 *         description: Failed to send reminder
 */
router.post("/reminders/:appointmentId", async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const result = await sendFollowUpReminder(appointmentId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error("Follow-up reminder error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
