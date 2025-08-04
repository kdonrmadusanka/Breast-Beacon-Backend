import nodemailer from "nodemailer";
import handlebars from "handlebars"; // ✅ fixed here
const { compile } = handlebars; // ✅ use this instead of direct named import
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import helpers from "handlebars-helpers";
import dotenv from "dotenv";
import { env } from "process";

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

export default {
  sendWelcomeEmail,
  sendVerificationEmail,
};
