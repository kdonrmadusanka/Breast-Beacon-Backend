import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import User from '../models/User.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465, // Use 465 for SSL
    secure: true, // true for SSL
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

/**
 * Load email template
 */
const loadEmailTemplate = async (templateName, variables = {}) => {
  try {
    const templatePath = path.join(
      __dirname,
      'email-templates',
      `${templateName}.html`,
    );
    let template = await fs.readFile(templatePath, 'utf-8');

    // Replace variables in template
    Object.keys(variables).forEach((key) => {
      const placeholder = `{{${key}}}`;
      const value = variables[key] || '';
      template = template.replace(new RegExp(placeholder, 'g'), value);
    });

    return template;
  } catch (error) {
    console.error(`Error loading email template ${templateName}:`, error);
    throw new Error(`Failed to load email template: ${templateName}`);
  }
};

/**
 * Send welcome email with verification link
 */
export const sendWelcomeEmail = async (user, verificationToken) => {
  try {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

    const html = await loadEmailTemplate('welcome', {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role.charAt(0).toUpperCase() + user.role.slice(1),
      userId: user.userId,
      verificationUrl: verificationUrl,
      currentYear: new Date().getFullYear(),
    });

    const transporter = createTransporter();

    const mailOptions = {
      from: `BreastBeacon <${
        process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER
      }>`,
      to: user.email,
      subject: `Welcome to BreastBeacon, ${user.firstName}! - Verify Your Email`,
      html: html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Welcome email sent to: ${user.email}`);
    return info;
  } catch (error) {
    console.error('❌ Error sending welcome email:', error);
    throw new Error('Failed to send welcome email');
  }
};

/**
 * Send password reset email
 */
export const sendPasswordResetEmail = async (user, resetToken) => {
  try {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    const html = await loadEmailTemplate('password-reset', {
      firstName: user.firstName,
      resetUrl: resetUrl,
      currentYear: new Date().getFullYear(),
    });

    const transporter = createTransporter();

    const mailOptions = {
      from: `BreastBeacon <${
        process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER
      }>`,
      to: user.email,
      subject: 'Password Reset Request - BreastBeacon',
      html: html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Password reset email sent to: ${user.email}`);
    return info;
  } catch (error) {
    console.error('❌ Error sending password reset email:', error);
    throw error;
  }
};

/**
 * Send email verification success email
 */
export const sendEmailVerificationSuccessEmail = async (user) => {
  try {
    const html = await loadEmailTemplate('verification-success', {
      firstName: user.firstName,
      role: user.role,
      loginUrl: `${process.env.FRONTEND_URL}/login`,
      currentYear: new Date().getFullYear(),
    });

    const transporter = createTransporter();

    const mailOptions = {
      from: `BreastBeacon <${
        process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER
      }>`,
      to: user.email,
      subject: 'Email Verified Successfully - BreastBeacon',
      html: html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email verification success email sent to: ${user.email}`);
    return info;
  } catch (error) {
    console.error('❌ Error sending verification success email:', error);
    throw error;
  }
};

/**
 * Send contact form notification to all admins
 */
export const sendContactNotification = async (contact) => {
  try {
    const admins = await User.find({ role: 'admin' }).select('email firstName');

    if (!admins || admins.length === 0) {
      console.log('No admin users found to send contact notification');
      return;
    }

    const adminEmails = admins.map((admin) => admin.email);

    const html = await loadEmailTemplate('contact-notification', {
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      role: contact.role
        ? contact.role.charAt(0).toUpperCase() + contact.role.slice(1)
        : 'Not specified',
      institution: contact.institution || 'Not specified',
      message: contact.message.replace(/\n/g, '<br>'),
      submittedAt: new Date(contact.createdAt).toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      adminUrl: `${process.env.FRONTEND_URL}/admin/contacts`,
      currentYear: new Date().getFullYear(),
    });

    const transporter = createTransporter();

    // In your email service, make sure to set these options:
    const mailOptions = {
      from: `"BreastBeacon" <${process.env.SMTP_FROM_EMAIL}>`,
      to: adminEmails,
      subject: `New Contact Form - ${contact.firstName} ${contact.lastName}`,
      html: html,
      text: `New contact form submitted by ${contact.firstName} ${contact.lastName}. 
           Message: ${contact.message}
           Email: ${contact.email}
           Role: ${contact.role}
           Institution: ${contact.institution}
           Please check the admin dashboard for details.`,
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        Importance: 'high',
      },
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(
      `✅ Contact notification sent to ${adminEmails.length} admin(s)`,
    );
    return {
      info,
      recipients: adminEmails,
      recipientCount: adminEmails.length,
    };
  } catch (error) {
    console.error('❌ Error sending contact notification:', error);
    throw new Error('Failed to send contact notification to admins');
  }
};

/**
 * Test email connection
 */
export const testEmailConnection = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('✅ Email server connection verified');
    return true;
  } catch (error) {
    console.error('❌ Email connection failed:', error);
    throw error;
  }
};

export default {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendEmailVerificationSuccessEmail,
  sendContactNotification,
  testEmailConnection,
};
