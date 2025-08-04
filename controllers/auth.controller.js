import User from "../models/User.js";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import {
  sendWelcomeEmail,
  sendVerificationEmail,
} from "../services/email.service.js";

/**
 * @swagger
 * tags:
 *   name: Authentication
 *   description: User registration and authentication endpoints
 *
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user (patient or medical professional)
 *     description: |
 *       Register a new user in the system.
 *       - Patients are automatically verified
 *       - Medical professionals require email verification
 *       - Returns JWT token in HTTP-only cookie
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/User'
 *           examples:
 *             patient:
 *               summary: Patient registration
 *               value:
 *                 firstName: "Jane"
 *                 lastName: "Doe"
 *                 email: "jane.doe@example.com"
 *                 password: "SecurePassword123!"
 *                 role: "patient"
 *             radiologist:
 *               summary: Radiologist registration
 *               value:
 *                 firstName: "John"
 *                 lastName: "Smith"
 *                 email: "john.smith@example.com"
 *                 password: "SecurePassword456!"
 *                 role: "radiologist"
 *                 specialization: "breast-imaging"
 *                 licenseNumber: "RAD123456"
 *                 institution: "507f1f77bcf86cd799439011"
 *     responses:
 *       201:
 *         description: User registered successfully
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *             description: JWT token in HTTP-only cookie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Patient registration successful!"
 *                 data:
 *                   $ref: '#/components/schemas/UserResponse'
 *             examples:
 *               patient:
 *                 value:
 *                   success: true
 *                   message: "Patient registration successful!"
 *                   data:
 *                     _id: "507f1f77bcf86cd799439011"
 *                     firstName: "Jane"
 *                     lastName: "Doe"
 *                     email: "jane.doe@example.com"
 *                     role: "patient"
 *                     isVerified: true
 *                     createdAt: "2023-05-20T12:00:00.000Z"
 *               medical:
 *                 value:
 *                   success: true
 *                   message: "Registration submitted! Please check your email to verify your account."
 *                   data:
 *                     _id: "507f1f77bcf86cd799439012"
 *                     firstName: "John"
 *                     lastName: "Smith"
 *                     email: "john.smith@example.com"
 *                     role: "radiologist"
 *                     isVerified: false
 *                     specialization: "breast-imaging"
 *                     institution: "507f1f77bcf86cd799439011"
 *                     createdAt: "2023-05-20T12:00:00.000Z"
 *       400:
 *         description: Bad request (missing or invalid fields)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               missingFields:
 *                 value:
 *                   success: false
 *                   message: "Please provide all required fields"
 *               medicalFieldsMissing:
 *                 value:
 *                   success: false
 *                   message: "Medical professionals must provide license number, specialization, and institution"
 *       409:
 *         description: Conflict (email already exists)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "Email already in use"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: "Registration failed. Please try again."
 *               error: "Error message (only in development)"
 */
export const registerUser = async (req, res) => {
  try {
    const { firstName, lastName, email, password, role } = req.body;

    // Basic validation
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide all required fields",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Email already in use",
      });
    }

    // Handle medical professional specific fields
    const isMedicalProfessional = [
      "radiologist",
      "physician",
      "technician",
      "admin",
    ].includes(role);
    const medicalFields = {};

    if (isMedicalProfessional) {
      const { licenseNumber, specialization, institution } = req.body;

      if (!licenseNumber || !specialization || !institution) {
        return res.status(400).json({
          success: false,
          message:
            "Medical professionals must provide license number, specialization, and institution",
        });
      }

      medicalFields.licenseNumber = licenseNumber;
      medicalFields.specialization = specialization;
      medicalFields.institution = institution;
    }

    // Create new user
    const newUser = await User.create({
      firstName,
      lastName,
      email,
      password,
      role: role || "patient",
      ...medicalFields,
      isVerified: role === "patient", // Auto-verify patients
    });

    // Generate JWT token
    const token = newUser.generateAuthToken();

    // IMPORTANT: Save the token to the user's tokens array
    await newUser.saveToken(token);

    console.log(token);

    // Prepare user data for response (without password)
    const userData = {
      _id: newUser._id,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      email: newUser.email,
      role: newUser.role,
      isVerified: newUser.isVerified,
      createdAt: newUser.createdAt,
    };

    // Add medical fields to response if applicable
    if (isMedicalProfessional) {
      userData.specialization = newUser.specialization;
      userData.institution = newUser.institution;
    }

    // Send appropriate email based on user type
    if (newUser.role === "patient") {
      await sendWelcomeEmail({
        email: newUser.email,
        name: `${newUser.firstName} ${newUser.lastName}`,
        role: "patient",
      });
    } else {
      // Create verification token for medical professionals
      const verificationToken = crypto.randomBytes(32).toString("hex");
      newUser.emailVerificationToken = crypto
        .createHash("sha256")
        .update(verificationToken)
        .digest("hex");
      await newUser.save();

      await sendVerificationEmail({
        email: newUser.email,
        name: `${newUser.firstName} ${newUser.lastName}`,
        verificationToken,
        role: newUser.role,
      });
    }

    // Set secure HTTP-only cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      sameSite: "strict",
    });

    return res.status(201).json({
      success: true,
      message:
        newUser.role === "patient"
          ? "Patient registration successful!"
          : "Registration submitted! Please check your email to verify your account.",
      data: userData,
      token: token, // Include the token in the response
    });
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({
      success: false,
      message: "Registration failed. Please try again.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: Authenticate user
 *     description: |
 *       Logs in a user and returns JWT token.
 *       - Uses HTTP-only cookies for web clients
 *       - Returns token in response body for API clients
 *       - Medical professionals must be verified
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: SecurePassword123!
 *     responses:
 *       200:
 *         description: Login successful
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *             description: JWT token in HTTP-only cookie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Login successful
 *                 data:
 *                   $ref: '#/components/schemas/UserResponse'
 *                 token:
 *                   type: string
 *                   description: JWT token for API clients
 *       400:
 *         description: Missing credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: Please provide email and password
 *       401:
 *         description: Unauthorized (invalid credentials, deactivated account, or unverified medical professional)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             examples:
 *               invalidCredentials:
 *                 value:
 *                   success: false
 *                   message: Invalid email or password
 *               deactivatedAccount:
 *                 value:
 *                   success: false
 *                   message: Account has been deactivated
 *               unverifiedAccount:
 *                 value:
 *                   success: false
 *                   message: Account not verified. Please check your email for verification instructions.
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *             example:
 *               success: false
 *               message: Login failed. Please try again.
 */
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password",
      });
    }

    // Find user with password field
    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await user.correctPassword(password, user.password))) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // Check if account is active
    if (!user.active) {
      return res.status(401).json({
        success: false,
        message: "Account has been deactivated",
      });
    }

    // Check verification for medical professionals
    if (
      ["radiologist", "physician", "technician", "admin"].includes(user.role) &&
      !user.isVerified
    ) {
      return res.status(401).json({
        success: false,
        message:
          "Account not verified. Please check your email for verification instructions.",
      });
    }

    // Generate token
    const token = await user.generateAuthToken();

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
      ["radiologist", "physician", "technician", "admin"].includes(user.role)
    ) {
      userData.specialization = user.specialization;
      userData.institution = user.institution;
    }

    // Set secure HTTP-only cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: "strict",
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: userData,
      token, // Also return token for API clients
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Login failed. Please try again.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
