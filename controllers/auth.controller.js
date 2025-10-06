import User from '../models/User.js';
import crypto from 'crypto';
import mongoose from 'mongoose';
import validator from 'validator';
import jwt from 'jsonwebtoken';
import {
  sendWelcomeEmail,
  sendVerificationEmail,
} from '../services/email_notification.service.js';
import Counter from '../models/Counter.js';

// Main registration function
export const registerUser = async (req, res) => {
  // Validate critical dependencies first
  if (!mongoose.connection.readyState) {
    return res.status(500).json({
      success: false,
      message: 'Database connection not available',
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { firstName, lastName, email, password, role = 'patient' } = req.body;

    // Input validation
    if (!firstName || !lastName || !email || !password) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided',
        requiredFields: ['firstName', 'lastName', 'email', 'password'],
      });
    }

    // Sanitize inputs
    const sanitizedData = {
      firstName: firstName.toString().trim(),
      lastName: lastName.toString().trim(),
      email: email.toString().toLowerCase().trim(),
      password: password.toString(),
      role: role.toString(),
    };

    // Email validation
    if (!validator.isEmail(sanitizedData.email)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address',
      });
    }

    // Check for existing user
    const User = mongoose.model('User');
    const existingUser = await User.findOne({
      email: sanitizedData.email,
    }).session(session);
    if (existingUser) {
      await session.abortTransaction();
      return res.status(409).json({
        success: false,
        message: 'Email address is already registered',
      });
    }

    // Handle medical professional fields
    const medicalFields = {};
    const MEDICAL_ROLES = ['radiologist', 'physician', 'technician', 'admin'];
    const isMedicalProfessional = MEDICAL_ROLES.includes(sanitizedData.role);

    if (isMedicalProfessional) {
      const { licenseNumber, specialization, institution } = req.body;

      if (!licenseNumber || !specialization || !institution) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message:
            'Medical professionals must provide license number, specialization, and institution',
        });
      }

      Object.assign(medicalFields, {
        licenseNumber: licenseNumber.toString().trim(),
        specialization: specialization.toString().trim(),
        institution: institution.toString().trim(),
      });
    }

    // Create user
    const newUser = await User.create(
      [
        {
          firstName: sanitizedData.firstName,
          lastName: sanitizedData.lastName,
          email: sanitizedData.email,
          password: sanitizedData.password,
          role: sanitizedData.role,
          ...medicalFields,
          isVerified: sanitizedData.role === 'patient',
          active: true,
        },
      ],
      { session },
    );

    const user = newUser[0];

    // Handle patient-specific creation
    if (sanitizedData.role === 'patient') {
      try {
        const Patient = mongoose.model('Patient');
        const patientId = await generatePatientId();
        const { dateOfBirth, gender, phoneNumber, address } = req.body;

        await Patient.create(
          [
            {
              user: user._id,
              patientId,
              dateOfBirth: dateOfBirth || null,
              gender: gender || null,
              phoneNumber: phoneNumber || null,
              address: address || null,
            },
          ],
          { session },
        );
      } catch (patientError) {
        console.error('Patient record creation failed:', patientError.message);
        // Continue with user creation even if patient record fails
      }
    }

    // Generate auth token
    const token = user.generateAuthToken();
    await user.saveToken(token);

    // Prepare response data
    const userData = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      createdAt: user.createdAt,
    };

    if (isMedicalProfessional) {
      userData.specialization = user.specialization;
      userData.institution = user.institution;
    }

    // Handle emails (non-blocking)
    if (sanitizedData.role === 'patient') {
      sendEmailSafely(
        sendWelcomeEmail,
        {
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: 'patient',
        },
        'Welcome',
      );
    } else {
      const verificationToken = crypto.randomBytes(32).toString('hex');
      user.emailVerificationToken = crypto
        .createHash('sha256')
        .update(verificationToken)
        .digest('hex');

      await user.save({ session });

      sendEmailSafely(
        sendVerificationEmail,
        {
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          verificationToken,
          role: user.role,
        },
        'Verification',
      );
    }

    // Commit transaction
    await session.commitTransaction();

    // Set HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'strict',
      path: '/',
    });

    return res.status(201).json({
      success: true,
      message:
        sanitizedData.role === 'patient'
          ? 'Patient registration completed successfully!'
          : 'Registration submitted! Please check your email for verification.',
      data: userData,
      token: token,
    });
  } catch (error) {
    await session.abortTransaction();

    console.error('Registration process error:', error);

    // User-friendly error messages
    let statusCode = 500;
    let message = 'Registration failed due to system error';

    if (error.name === 'ValidationError') {
      statusCode = 400;
      message = 'Invalid input data provided';
    } else if (error.code === 11000) {
      statusCode = 409;
      message = 'Email address already exists';
    } else if (error.name === 'CastError') {
      statusCode = 400;
      message = 'Invalid data format';
    }

    return res.status(statusCode).json({
      success: false,
      message: message,
      ...(process.env.NODE_ENV === 'development' && {
        error: error.message,
        stack: error.stack,
      }),
    });
  } finally {
    session.endSession();
  }
};

// Helper function to safely require/generate patient ID
const generatePatientId = async () => {
  try {
    // Make sure Counter model is properly imported
    const Counter = mongoose.model('Counter');
    const counter = await Counter.findOneAndUpdate(
      { name: 'patientId' },
      { $inc: { value: 1 } },
      { new: true, upsert: true },
    );
    return `P-${String(counter.value).padStart(4, '0')}`;
  } catch (error) {
    console.error(
      'Patient ID generation failed, using fallback:',
      error.message,
    );
    // Fallback: timestamp-based ID
    return `P-${Date.now().toString().slice(-6)}`;
  }
};

const sendEmailSafely = async (emailFunction, emailData, errorContext) => {
  try {
    await emailFunction(emailData);
    console.log(`${errorContext} email sent successfully`);
    return true;
  } catch (emailError) {
    console.warn(`${errorContext} email failed:`, emailError.message);
    return false;
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password',
      });
    }

    // Find user with password field
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.correctPassword(password, user.password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    // Check if account is active
    if (user.active === false) {
      return res.status(401).json({
        success: false,
        message: 'Account has been deactivated',
      });
    }

    // Check verification for medical professionals
    if (
      ['radiologist', 'physician', 'technician', 'admin'].includes(user.role) &&
      !user.isVerified
    ) {
      return res.status(401).json({
        success: false,
        message:
          'Account not verified. Please check your email for verification instructions.',
      });
    }

    // Generate token
    const token = await user.generateAuthToken();

    // Save the token to the user's tokens array
    await user.saveToken(token);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Prepare user data for response
    const userData = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      lastLogin: user.lastLogin,
    };

    // Add medical fields if applicable
    if (
      ['radiologist', 'physician', 'technician', 'admin'].includes(user.role)
    ) {
      userData.specialization = user.specialization;
      userData.institution = user.institution;
    }

    // Set secure HTTP-only cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'strict',
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: userData,
      token, // Also return token for API clients
    });
  } catch (error) {
    console.error('Login error:', error);

    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
