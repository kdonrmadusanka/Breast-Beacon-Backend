import express from "express";
import { loginUser, registerUser } from "../controllers/auth.controller.js";
import {
  validateLogin,
  validateRegister,
} from "../middleware/validation.middleware.js";

const router = express.Router();

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
router.post("/register", validateRegister, registerUser);

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
router.post("/login", validateLogin, loginUser);

export default router;
