import Contact from '../models/Contact.js';
import { sendContactNotification } from '../utils/emailService.js';
import { validate as deepEmailValidate } from 'deep-email-validator';

// Valid roles list
const VALID_ROLES = [
  'patient',
  'radiologist',
  'physician',
  'technician',
  'administrator',
  'other',
];

// Helper function to validate email format and existence
async function isEmailValid(email) {
  if (!email || email.length > 254) return false;
  const result = await deepEmailValidate(email);
  return result.valid;
}

export const submitContact = async (req, res) => {
  try {
    const { firstName, lastName, email, institution, role, message } = req.body;

    // Required field validation
    const missingFields = [];
    if (!firstName?.trim()) missingFields.push('First name');
    if (!lastName?.trim()) missingFields.push('Last name');
    if (!email?.trim()) missingFields.push('Email');
    if (!message?.trim()) missingFields.push('Message');

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `${missingFields.join(', ')} ${
          missingFields.length > 1 ? 'are' : 'is'
        } required`,
      });
    }

    // Email validation
    const emailTrimmed = email.toLowerCase().trim();
    const validEmail = await isEmailValid(emailTrimmed);
    if (!validEmail) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      });
    }

    // Length validation
    if (firstName.trim().length > 50)
      return res.status(400).json({
        success: false,
        message: 'First name cannot exceed 50 characters',
      });

    if (lastName.trim().length > 50)
      return res.status(400).json({
        success: false,
        message: 'Last name cannot exceed 50 characters',
      });

    if (message.trim().length > 2000)
      return res.status(400).json({
        success: false,
        message: 'Message cannot exceed 2000 characters',
      });

    // Role validation
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role provided. Please select a valid option.',
      });
    }

    // Create new contact document
    const contact = await Contact.create({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: emailTrimmed,
      institution: institution?.trim() || '',
      role: role || 'other',
      message: message.trim(),
    });

    // Send async email (non-blocking)
    sendContactNotification(contact).catch((error) => {
      console.error('Email notification error:', error.message);
    });

    // Respond success
    return res.status(201).json({
      success: true,
      message: 'Thank you for your message. We will get back to you soon.',
      data: {
        id: contact._id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        institution: contact.institution,
        role: contact.role,
        createdAt: contact.createdAt,
      },
    });
  } catch (error) {
    console.error('Contact form error:', error);

    // Handle validation or duplicate key errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res
        .status(400)
        .json({ success: false, message: messages.join(', ') });
    }

    if (error.code === 11000) {
      return res
        .status(400)
        .json({ success: false, message: 'Duplicate field value entered' });
    }

    // Default error handler
    return res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again later.',
    });
  }
};
