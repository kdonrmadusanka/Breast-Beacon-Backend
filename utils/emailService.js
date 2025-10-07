import nodemailer from 'nodemailer';

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
};

/**
 * Send welcome email with verification link
 * @param {Object} user - User object
 * @param {String} verificationToken - Email verification token
 * @returns {Promise}
 */
export const sendWelcomeEmail = async (user, verificationToken) => {
  try {
    const transporter = createTransporter();

    const verificationUrl = `${process.env.CLIENT_URL}/verify-email?token=${verificationToken}`;

    const mailOptions = {
      from: `"Medical Imaging App" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `Welcome to Medical Imaging App, ${user.firstName}! - Verify Your Email`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { 
              font-family: 'Arial', sans-serif; 
              line-height: 1.6; 
              color: #333; 
              margin: 0; 
              padding: 0; 
              background-color: #f4f4f4;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              background: white;
              border-radius: 10px;
              overflow: hidden;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            .header { 
              background: linear-gradient(135deg, #007bff, #0056b3);
              color: white; 
              padding: 30px 20px; 
              text-align: center; 
            }
            .logo {
              font-size: 24px;
              font-weight: bold;
              margin-bottom: 10px;
            }
            .content { 
              padding: 30px; 
            }
            .button { 
              display: inline-block; 
              padding: 14px 28px; 
              background: #007bff; 
              color: white; 
              text-decoration: none; 
              border-radius: 5px; 
              margin: 20px 0; 
              font-weight: bold;
              font-size: 16px;
            }
            .button:hover {
              background: #0056b3;
            }
            .footer { 
              text-align: center; 
              padding: 20px; 
              color: #666; 
              font-size: 14px; 
              background: #f8f9fa;
              border-top: 1px solid #e9ecef;
            }
            .token-link {
              word-break: break-all;
              background: #f8f9fa;
              padding: 10px;
              border-radius: 5px;
              border: 1px solid #e9ecef;
              margin: 15px 0;
              font-size: 12px;
              color: #495057;
            }
            .user-info {
              background: #e7f3ff;
              padding: 15px;
              border-radius: 5px;
              margin: 15px 0;
              border-left: 4px solid #007bff;
            }
            .expiry-note {
              color: #dc3545;
              font-weight: bold;
              background: #ffeaea;
              padding: 10px;
              border-radius: 5px;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">Medical Imaging App</div>
              <h1>Welcome to Our Platform!</h1>
            </div>
            <div class="content">
              <h2>Hello ${user.firstName} ${user.lastName},</h2>
              
              <div class="user-info">
                <p><strong>Account Details:</strong></p>
                <p>Email: ${user.email}</p>
                <p>Role: <strong>${
                  user.role.charAt(0).toUpperCase() + user.role.slice(1)
                }</strong></p>
                <p>User ID: ${user.userId}</p>
              </div>
              
              <p>Thank you for registering with our Medical Imaging App. We're excited to have you on board!</p>
              
              <p>To complete your registration and activate your account, please verify your email address by clicking the button below:</p>
              
              <div style="text-align: center;">
                <a href="${verificationUrl}" class="button">Verify Email Address</a>
              </div>
              
              <p>Or copy and paste this link in your browser:</p>
              <div class="token-link">${verificationUrl}</div>
              
              <div class="expiry-note">
                ⚠️ This verification link will expire in 24 hours.
              </div>
              
              <p>Once verified, you'll be able to:</p>
              <ul>
                <li>Access all platform features</li>
                <li>Upload and view medical images</li>
                <li>Collaborate with healthcare professionals</li>
                <li>Manage your profile and preferences</li>
              </ul>
              
              <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
              
              <p>Best regards,<br>The Medical Imaging App Team</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Medical Imaging App. All rights reserved.</p>
              <p>This is an automated message. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Welcome email sent to: ${user.email}`);
    return result;
  } catch (error) {
    console.error('❌ Error sending welcome email:', error);
    throw new Error('Failed to send welcome email');
  }
};

/**
 * Send password reset email
 * @param {Object} user - User object
 * @param {String} resetToken - Password reset token
 * @returns {Promise}
 */
export const sendPasswordResetEmail = async (user, resetToken) => {
  try {
    const transporter = createTransporter();

    const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: `"Medical Imaging App" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Password Reset Request - Medical Imaging App',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { 
              font-family: 'Arial', sans-serif; 
              line-height: 1.6; 
              color: #333; 
              margin: 0; 
              padding: 0; 
              background-color: #f4f4f4;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              background: white;
              border-radius: 10px;
              overflow: hidden;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            .header { 
              background: linear-gradient(135deg, #dc3545, #c82333);
              color: white; 
              padding: 25px 20px; 
              text-align: center; 
            }
            .content { 
              padding: 30px; 
            }
            .button { 
              display: inline-block; 
              padding: 14px 28px; 
              background: #dc3545; 
              color: white; 
              text-decoration: none; 
              border-radius: 5px; 
              margin: 20px 0; 
              font-weight: bold;
            }
            .button:hover {
              background: #c82333;
            }
            .footer { 
              text-align: center; 
              padding: 20px; 
              color: #666; 
              font-size: 14px; 
              background: #f8f9fa;
            }
            .token-link {
              word-break: break-all;
              background: #f8f9fa;
              padding: 10px;
              border-radius: 5px;
              border: 1px solid #e9ecef;
              margin: 15px 0;
              font-size: 12px;
            }
            .warning-note {
              color: #856404;
              background: #fff3cd;
              padding: 12px;
              border-radius: 5px;
              border: 1px solid #ffeaa7;
              text-align: center;
              font-weight: bold;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Reset Request</h1>
            </div>
            <div class="content">
              <h2>Hello ${user.firstName},</h2>
              
              <p>We received a request to reset your password for your Medical Imaging App account.</p>
              
              <p>Click the button below to create a new password:</p>
              
              <div style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Your Password</a>
              </div>
              
              <p>Or copy and paste this link in your browser:</p>
              <div class="token-link">${resetUrl}</div>
              
              <div class="warning-note">
                ⚠️ This password reset link will expire in 10 minutes for security reasons.
              </div>
              
              <p>If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
              
              <p>For security reasons, please do not share this email with anyone.</p>
              
              <p>Best regards,<br>The Medical Imaging App Team</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Medical Imaging App. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Password reset email sent to: ${user.email}`);
    return result;
  } catch (error) {
    console.error('❌ Error sending password reset email:', error);
    throw error;
  }
};

/**
 * Send email verification success email
 * @param {Object} user - User object
 * @returns {Promise}
 */
export const sendEmailVerificationSuccessEmail = async (user) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"Medical Imaging App" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Email Verified Successfully - Medical Imaging App',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { 
              font-family: 'Arial', sans-serif; 
              line-height: 1.6; 
              color: #333; 
              margin: 0; 
              padding: 0; 
              background-color: #f4f4f4;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              background: white;
              border-radius: 10px;
              overflow: hidden;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            .header { 
              background: linear-gradient(135deg, #28a745, #20c997);
              color: white; 
              padding: 25px 20px; 
              text-align: center; 
            }
            .content { 
              padding: 30px; 
            }
            .button { 
              display: inline-block; 
              padding: 14px 28px; 
              background: #28a745; 
              color: white; 
              text-decoration: none; 
              border-radius: 5px; 
              margin: 20px 0; 
              font-weight: bold;
            }
            .footer { 
              text-align: center; 
              padding: 20px; 
              color: #666; 
              font-size: 14px; 
              background: #f8f9fa;
            }
            .success-note {
              color: #155724;
              background: #d4edda;
              padding: 15px;
              border-radius: 5px;
              border: 1px solid #c3e6cb;
              text-align: center;
              font-weight: bold;
              font-size: 16px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Email Verified Successfully! 🎉</h1>
            </div>
            <div class="content">
              <h2>Congratulations ${user.firstName}!</h2>
              
              <div class="success-note">
                ✅ Your email has been successfully verified!
              </div>
              
              <p>Your account is now fully activated and you can access all features of the Medical Imaging App.</p>
              
              <p>You can now:</p>
              <ul>
                <li>Login to your account</li>
                <li>Access platform features based on your role (${
                  user.role
                })</li>
                <li>Update your profile information</li>
                <li>Start using our medical imaging services</li>
              </ul>
              
              <div style="text-align: center;">
                <a href="${
                  process.env.CLIENT_URL
                }/login" class="button">Login to Your Account</a>
              </div>
              
              <p>If you have any questions or need assistance, our support team is here to help.</p>
              
              <p>Welcome aboard!<br>The Medical Imaging App Team</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Medical Imaging App. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Email verification success email sent to: ${user.email}`);
    return result;
  } catch (error) {
    console.error('❌ Error sending verification success email:', error);
    throw error;
  }
};

/**
 * Send account status update email
 * @param {Object} user - User object
 * @param {String} status - Account status
 * @param {String} message - Status message
 * @returns {Promise}
 */
export const sendAccountStatusEmail = async (user, status, message) => {
  try {
    const transporter = createTransporter();

    const statusColors = {
      activated: '#28a745',
      deactivated: '#dc3545',
      suspended: '#ffc107',
      updated: '#17a2b8',
    };

    const statusColor = statusColors[status] || '#6c757d';

    const mailOptions = {
      from: `"Medical Imaging App" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `Account ${
        status.charAt(0).toUpperCase() + status.slice(1)
      } - Medical Imaging App`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { 
              font-family: 'Arial', sans-serif; 
              line-height: 1.6; 
              color: #333; 
              margin: 0; 
              padding: 0; 
              background-color: #f4f4f4;
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              background: white;
              border-radius: 10px;
              overflow: hidden;
              box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            .header { 
              background: linear-gradient(135deg, ${statusColor}, ${statusColor}99);
              color: white; 
              padding: 25px 20px; 
              text-align: center; 
            }
            .content { 
              padding: 30px; 
            }
            .footer { 
              text-align: center; 
              padding: 20px; 
              color: #666; 
              font-size: 14px; 
              background: #f8f9fa;
            }
            .status-box {
              background: #f8f9fa;
              padding: 15px;
              border-radius: 5px;
              border-left: 4px solid ${statusColor};
              margin: 15px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Account ${
                status.charAt(0).toUpperCase() + status.slice(1)
              }</h1>
            </div>
            <div class="content">
              <h2>Hello ${user.firstName},</h2>
              
              <div class="status-box">
                <p><strong>Account Update:</strong> ${message}</p>
                <p><strong>User ID:</strong> ${user.userId}</p>
                <p><strong>Role:</strong> ${user.role}</p>
                <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
              </div>
              
              <p>If you have any questions about this change or believe this was done in error, please contact our support team immediately.</p>
              
              <p>Best regards,<br>The Medical Imaging App Team</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} Medical Imaging App. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Account status email sent to: ${user.email}`);
    return result;
  } catch (error) {
    console.error('❌ Error sending account status email:', error);
    throw error;
  }
};

/**
 * Test email connectivity
 * @returns {Promise}
 */
export const testEmailConnection = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('✅ Email server connection verified');
    return true;
  } catch (error) {
    console.error('❌ Email server connection failed:', error);
    throw error;
  }
};

export default {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendEmailVerificationSuccessEmail,
  sendAccountStatusEmail,
  testEmailConnection,
  createTransporter,
};
