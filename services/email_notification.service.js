import nodemailer from "nodemailer";
import handlebars from "handlebars"; // ✅ fixed here
const { compile } = handlebars; // ✅ use this instead of direct named import
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import helpers from "handlebars-helpers";
import dotenv from "dotenv";
import { env } from "process";
import Patient from "../models/Patient.js";
import NotificationTemplate from "../models/NotificationTemplate.js";
import { generatePatientFriendlyExplanation } from "../utils/recommendationEngine.js";
import Mammogram from "../models/Mammogram.js";
import Notification from "../models/Notification.js";
import Appointment from "../models/Appointment.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Register all helpers from handlebars-helpers
helpers({
  handlebars: handlebars,
});

// Email transporter configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Read template files
const readTemplate = (templateName) => {
  const templatePath = path.join(
    __dirname,
    `../templates/emails/${templateName}.hbs`
  );
  return fs.readFileSync(templatePath, "utf8");
};

// Compile templates
const templates = {
  welcomeEmail: compile(readTemplate("welcome")),
  verificationEmail: compile(readTemplate("verification")),
};

/**
 * Send welcome email to newly registered patients
 * @param {Object} params - Email parameters
 * @param {string} params.email - Recipient email
 * @param {string} params.name - Recipient name
 * @param {string} params.role - User role
 */
export const sendWelcomeEmail = async ({ email, name, role }) => {
  try {
    const html = templates.welcomeEmail({
      name,
      role,
      appName: process.env.APP_NAME,
      supportEmail: process.env.SUPPORT_EMAIL,
      currentYear: new Date().getFullYear(),
    });

    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_ADDRESS}>`,
      to: email,
      subject: `Welcome to ${process.env.APP_NAME}!`,
      html,
      text: `Welcome ${name} to ${process.env.APP_NAME}! As a ${role}, you can now access your account.`,
    });
  } catch (error) {
    console.error("Error sending welcome email:", error);
    throw error;
  }
};

/**
 * Send verification email to medical professionals
 * @param {Object} params - Email parameters
 * @param {string} params.email - Recipient email
 * @param {string} params.name - Recipient name
 * @param {string} params.verificationToken - Verification token
 * @param {string} params.role - User role
 */
export const sendVerificationEmail = async ({
  email,
  name,
  verificationToken,
  role,
}) => {
  try {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

    const html = templates.verificationEmail({
      name,
      role,
      verificationUrl,
      appName: process.env.APP_NAME,
      supportEmail: process.env.SUPPORT_EMAIL,
      currentYear: new Date().getFullYear(),
    });

    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM_ADDRESS}>`,
      to: email,
      subject: `Verify Your ${process.env.APP_NAME} Account`,
      html,
      text: `Please verify your ${process.env.APP_NAME} account by visiting: ${verificationUrl}`,
    });
  } catch (error) {
    console.error("Error sending verification email:", error);
    throw error;
  }
};

/**
 * Send mammogram results notification
 * @param {string} mammogramId - Mammogram ID
 * @param {string} channel - Preferred notification channel
 * @returns {Promise<Object>} Notification result
 */
export const sendResultsNotification = async (
  mammogramId,
  channel = "portal"
) => {
  const mammogram = await Mammogram.findById(mammogramId)
    .populate("patientId")
    .populate("analysisResults");

  if (!mammogram) {
    throw new Error("Mammogram not found");
  }

  const patient = mammogram.patientId;
  const analysis = mammogram.analysisResults;

  // Get appropriate template
  const template = await getNotificationTemplate(
    "results",
    analysis.overallAssessment.category,
    patient.languagePreference || "en"
  );

  // Generate patient-friendly explanations
  const explanations = generatePatientFriendlyExplanation(
    analysis.recommendations,
    patient.languagePreference
  );

  // Prepare notification content
  const content = {
    subject: template.subject.replace("{patientName}", patient.firstName),
    body: template.body
      .replace("{patientName}", patient.firstName)
      .replace("{resultsSummary}", getResultsSummary(analysis))
      .replace("{recommendations}", formatRecommendations(explanations)),
    attachments: [],
  };

  // Add PDF report if available
  if (mammogram.reportPdfPath) {
    content.attachments.push(mammogram.reportPdfPath);
  }

  // Send via selected channel
  let result;
  switch (channel.toLowerCase()) {
    case "email":
      result = await sendEmail(patient.email, content);
      break;
    case "portal":
      result = await sendPortalNotification(patient.id, content);
      break;
    default:
      throw new Error(`Unsupported channel: ${channel}`);
  }

  // Create notification record
  const notification = new Notification({
    patientId: patient.id,
    mammogramId,
    channel,
    status: result.success ? "sent" : "failed",
    content,
    auditLog: [
      {
        timestamp: new Date(),
        event: "send_attempt",
        details: result.message,
      },
    ],
  });

  await notification.save();

  return {
    success: result.success,
    notificationId: notification.id,
    message: result.message,
  };
};

/**
 * Send follow-up reminder
 * @param {string} appointmentId - Appointment ID
 * @returns {Promise<Object>} Notification result
 */
export const sendFollowUpReminder = async (appointmentId) => {
  const appointment = await Appointment.findById(appointmentId)
    .populate("patientId")
    .populate("mammogramId");

  if (!appointment) {
    throw new Error("Appointment not found");
  }

  const patient = appointment.patientId;
  const template = await getNotificationTemplate(
    "reminder",
    "followup",
    patient.languagePreference || "en"
  );

  const content = {
    subject: template.subject.replace("{patientName}", patient.firstName),
    body: template.body
      .replace("{patientName}", patient.firstName)
      .replace("{appointmentDate}", formatDate(appointment.date))
      .replace("{appointmentTime}", formatTime(appointment.time))
      .replace("{location}", appointment.location),
    attachments: [],
  };

  // Send via email (only channel available in this version)
  let result;
  if (patient.email) {
    result = await sendEmail(patient.email, content);
  } else {
    result = { success: false, message: "No email address available" };
  }

  // Log notification
  const notification = new Notification({
    patientId: patient.id,
    appointmentId,
    channel: result.success ? "email" : "none",
    status: result.success ? "sent" : "failed",
    content,
    auditLog: [
      {
        timestamp: new Date(),
        event: "reminder_sent",
        details: result.message,
      },
    ],
  });

  await notification.save();

  return {
    success: result.success,
    notificationId: notification.id,
  };
};

// Helper Functions

async function getNotificationTemplate(type, category, language = "en") {
  const template = await NotificationTemplate.findOne({
    type,
    category,
    language,
    active: true,
  });

  if (!template) {
    throw new Error(`No template found for ${type}/${category}/${language}`);
  }

  return template;
}

export async function sendEmail(email, content) {
  try {
    const mailOptions = {
      from: `"Mammography Center" <${process.env.EMAIL_FROM}>`,
      to: email,
      subject: content.subject,
      text: content.body,
      html: convertToHtml(content.body),
      attachments: content.attachments.map((file) => ({
        path: file,
        filename: path.basename(file),
      })),
    };

    const info = await transporter.sendMail(mailOptions);
    return {
      success: true,
      message: info.messageId,
      channelUsed: "email",
    };
  } catch (error) {
    console.error("Email send failed:", error);
    return {
      success: false,
      message: error.message,
    };
  }
}

async function sendPortalNotification(patientId, content) {
  // Implementation depends on your patient portal system
  return {
    success: true,
    message: "Portal notification queued",
    channelUsed: "portal",
  };
}

function getResultsSummary(analysis) {
  const { overallAssessment, findings } = analysis;

  if (
    overallAssessment.category === "1" ||
    overallAssessment.category === "2"
  ) {
    return "Your mammogram results are normal with no signs of cancer.";
  }

  if (overallAssessment.category === "3") {
    return "Your mammogram shows probably benign findings that should be checked again in 6 months.";
  }

  if (overallAssessment.category.startsWith("4")) {
    const suspiciousCount = findings.filter((f) =>
      f.birads.startsWith("4")
    ).length;
    return `Your mammogram shows ${suspiciousCount} area(s) that may need further evaluation.`;
  }

  if (overallAssessment.category === "5") {
    return "Your mammogram shows findings that are highly suspicious for cancer.";
  }

  return "Your mammogram results are ready. Please review with your doctor.";
}

function formatRecommendations(explanations) {
  return explanations.map((e) => `• ${e.explanation}`).join("\n");
}

function convertToHtml(text) {
  // Simple conversion - replace newlines with <br>
  return `<p>${text.replace(/\n/g, "<br>")}</p>`;
}

export default {
  sendFollowUpReminder,
  sendResultsNotification,
  sendWelcomeEmail,
  sendVerificationEmail,
  sendEmail,
};
