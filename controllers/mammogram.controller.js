import { AuditLog } from "../models/User.model.js";
import Mammogram from "../models/Mammogram.model.js";
import { successResponse } from "../utils/responseHandler.js";
import { AppError } from "../utils/errorHandler.js";
import winston from "winston";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";
import dicomParser from "dicom-parser";

// Configure Winston logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "logs/mammogram.log" }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), "uploads/mammograms");
fs.mkdir(uploadDir, { recursive: true }).catch((err) => {
  logger.error("Failed to create upload directory", { error: err.message });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.user._id}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== ".dcm" && ext !== ".png") {
    return cb(
      new AppError("Only DICOM (.dcm) or PNG files are allowed", 400),
      false
    );
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
}).single("mammogram");

// Encryption key (should be stored securely in production)
const ENCRYPTION_KEY =
  process.env.MAMMOGRAM_ENCRYPTION_KEY ||
  crypto.randomBytes(32).toString("hex");
const IV_LENGTH = 16; // AES-256-CBC requires 16-byte IV

/**
 * @desc    Encrypt a file using AES-256-CBC
 * @param {string} inputPath - Path to the input file
 * @param {string} outputPath - Path to save the encrypted file
 * @returns {Promise<void>}
 */
const encryptFile = async (inputPath, outputPath) => {
  try {
    const inputData = await fs.readFile(inputPath);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      Buffer.from(ENCRYPTION_KEY, "hex"),
      iv
    );
    const encrypted = Buffer.concat([cipher.update(inputData), cipher.final()]);
    await fs.writeFile(outputPath, Buffer.concat([iv, encrypted]));
    await fs.unlink(inputPath); // Remove unencrypted file
    logger.info("File encrypted successfully", { outputPath });
  } catch (error) {
    logger.error("File encryption failed", { inputPath, error: error.message });
    throw new AppError("Failed to encrypt file", 500);
  }
};

/**
 * @desc    Validate DICOM file integrity
 * @param {string} filePath - Path to the DICOM file
 * @returns {Promise<boolean>} True if valid, throws error if invalid
 */
const validateDicom = async (filePath) => {
  try {
    const data = await fs.readFile(filePath);
    dicomParser.parseDicom(data); // Throws if invalid
    return true;
  } catch (error) {
    logger.error("DICOM validation failed", { filePath, error: error.message });
    throw new AppError("Invalid DICOM file", 400);
  }
};

/**
 * @desc    Upload a mammogram image (DICOM or PNG)
 * @route   POST /api/mammograms/upload
 * @access  Private (patient only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const uploadMammogram = async (req, res, next) => {
  try {
    // Check if user is a patient
    if (req.user.role !== "patient") {
      throw new AppError("Only patients can upload mammograms", 403);
    }

    // Handle file upload with multer
    await new Promise((resolve, reject) => {
      upload(req, res, (err) => {
        if (err instanceof multer.MulterError) {
          return reject(new AppError(`Upload error: ${err.message}`, 400));
        } else if (err) {
          return reject(err);
        }
        resolve();
      });
    });

    if (!req.file) {
      throw new AppError("No file uploaded", 400);
    }

    const fileExt = path.extname(req.file.filename).toLowerCase();
    const encryptedPath = path.join(uploadDir, `${req.file.filename}.enc`);

    // Validate DICOM file if applicable
    if (fileExt === ".dcm") {
      await validateDicom(req.file.path);
    }

    // Encrypt the uploaded file
    await encryptFile(req.file.path, encryptedPath);

    // Save metadata to Mammogram model
    const mammogram = await Mammogram.create({
      patientId: req.user._id,
      filePath: encryptedPath,
      originalFilename: req.file.originalname,
      fileType: fileExt === ".dcm" ? "DICOM" : "PNG",
      fileSize: req.file.size,
      uploadDate: new Date(),
    });

    // Create audit log for mammogram upload
    await AuditLog.create({
      userId: req.user._id,
      action: "mammogram_uploaded",
      details: {
        email: req.user.email,
        mammogramId: mammogram._id,
        fileType: mammogram.fileType,
        fileSize: mammogram.fileSize,
      },
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    logger.info("Audit log created for mammogram upload", {
      userId: req.user._id,
      mammogramId: mammogram._id,
    });

    logger.info("Mammogram uploaded successfully", {
      userId: req.user._id,
      mammogramId: mammogram._id,
      fileType: mammogram.fileType,
    });

    return successResponse(
      res,
      {
        mammogram: {
          id: mammogram._id,
          fileType: mammogram.fileType,
          uploadDate: mammogram.uploadDate,
        },
      },
      "Mammogram uploaded successfully",
      201,
      req,
      "mammogram_uploaded"
    );
  } catch (error) {
    logger.error("Failed to upload mammogram", {
      userId: req.user._id,
      error: error.message,
    });
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {}); // Clean up unencrypted file on error
    }
    next(error);
  }
};

/**
 * @desc    Get all mammograms for the current patient
 * @route   GET /api/mammograms
 * @access  Private (patient only)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const getMammograms = async (req, res, next) => {
  try {
    if (req.user.role !== "patient") {
      throw new AppError("Only patients can view their mammograms", 403);
    }

    const mammograms = await Mammogram.find({ patientId: req.user._id })
      .select("-filePath") // Exclude filePath for security
      .lean();

    // Create audit log for mammogram retrieval
    await AuditLog.create({
      userId: req.user._id,
      action: "mammograms_retrieved",
      details: { email: req.user.email, mammogramCount: mammograms.length },
      ipAddress: req.ip,
      deviceInfo: req.headers["user-agent"] || "Unknown",
    });
    logger.info("Audit log created for mammogram retrieval", {
      userId: req.user._id,
      mammogramCount: mammograms.length,
    });

    logger.info("Mammograms retrieved successfully", {
      userId: req.user._id,
      mammogramCount: mammograms.length,
    });

    return successResponse(
      res,
      { mammograms },
      "Mammograms retrieved successfully",
      200,
      req,
      "mammograms_retrieved"
    );
  } catch (error) {
    logger.error("Failed to retrieve mammograms", {
      userId: req.user._id,
      error: error.message,
    });
    next(error);
  }
};

export { uploadMammogram, getMammograms };
