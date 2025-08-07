import { body, validationResult } from "express-validator";

export const validateRegister = [
  body("firstName")
    .trim()
    .notEmpty()
    .withMessage("First name is required")
    .isLength({ max: 50 })
    .withMessage("First name cannot exceed 50 characters"),

  body("lastName")
    .trim()
    .notEmpty()
    .withMessage("Last name is required")
    .isLength({ max: 50 })
    .withMessage("Last name cannot exceed 50 characters"),

  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email")
    .normalizeEmail(),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),

  body("role")
    .optional()
    .isIn(["patient", "radiologist", "physician", "technician", "admin"])
    .withMessage("Invalid user role"),

  body("specialization")
    .if(body("role").isIn(["radiologist", "physician"]))
    .notEmpty()
    .withMessage("Specialization is required for medical professionals")
    .isIn(["breast-imaging", "general-radiology", "oncology", "gynecology"])
    .withMessage("Invalid specialization"),

  body("licenseNumber")
    .if(body("role").isIn(["radiologist", "physician"]))
    .notEmpty()
    .withMessage("License number is required for medical professionals"),

  body("institution")
    .if(body("role").isIn(["radiologist", "physician", "technician", "admin"]))
    .notEmpty()
    .withMessage("Institution is required for medical professionals"),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }
    next();
  },
];

export const validateLogin = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .isEmail()
    .withMessage("Please provide a valid email")
    .normalizeEmail(),

  body("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array(),
      });
    }
    next();
  },
];
