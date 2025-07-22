import { validationResult, check, body } from "express-validator";

/**
 * Reusable validation schemas for common fields
 */
const validationSchemas = {
  email: body("email")
    .isEmail()
    .withMessage("Please include a valid email")
    .normalizeEmail()
    .trim()
    .escape(),
  password: body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .matches(/[a-z]/)
    .withMessage("Password must contain at least one lowercase letter")
    .matches(/[0-9]/)
    .withMessage("Password must contain at least one number")
    .matches(/[!@#$%^&*(),.?":{}|<>]/)
    .withMessage("Password must contain at least one special character"),
  firstName: body("firstName")
    .notEmpty()
    .withMessage("First name is required")
    .trim()
    .escape(),
  lastName: body("lastName")
    .notEmpty()
    .withMessage("Last name is required")
    .trim()
    .escape(),
  phoneNumber: body("phoneNumber")
    .isMobilePhone()
    .withMessage("Please include a valid phone number")
    .trim(),
  dateOfBirth: body("dateOfBirth")
    .isISO8601()
    .withMessage("Please include a valid date of birth")
    .toDate(),
  role: body("role")
    .optional()
    .isIn(["patient", "clinician", "admin"])
    .withMessage("Please specify a valid role"),
  token: body("token").notEmpty().withMessage("Token is required").trim(),
  refreshToken: body("refreshToken")
    .notEmpty()
    .withMessage("Refresh token is required")
    .trim(),
  twoFactorCode: body("twoFactorCode")
    .optional()
    .isString()
    .withMessage("Two-factor code must be a string")
    .isLength({ min: 6, max: 6 })
    .withMessage("Two-factor code must be 6 characters long"),
};

/**
 * Middleware to validate request data
 * @param {Array} validations - Array of express-validator checks
 * @returns {Function} Express middleware
 */
const validate = (validations) => {
  return async (req, res, next) => {
    try {
      // Run all validations
      await Promise.all(validations.map((validation) => validation.run(req)));

      // Check for validation errors
      const errors = validationResult(req);
      if (errors.isEmpty()) {
        return next();
      }

      // Format errors by field
      const formattedErrors = errors.array().reduce((acc, err) => {
        if (!acc[err.path]) {
          acc[err.path] = [];
        }
        acc[err.path].push(err.msg);
        return acc;
      }, {});

      return res.status(422).json({
        success: false,
        message: "Validation failed",
        errors: formattedErrors,
      });
    } catch (error) {
      console.error("Validation middleware error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error during validation",
      });
    }
  };
};

export { validate, validationSchemas };
