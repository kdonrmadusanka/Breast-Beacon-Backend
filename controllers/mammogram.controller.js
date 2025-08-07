import Mammogram from "../models/Mammogram.js";
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import sharp from "sharp"; // For image processing
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import mammogramMetadataParser from "../utils/mammogram-metadata-parser.js"; // Hypothetical DICOM parser
import { anonymizeDicomFile } from "../utils/dicomAnonymizer.js";
import crypto from "crypto";

// Configure S3 if using cloud storage
const s3Client =
  process.env.STORAGE_TYPE === "s3"
    ? new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY,
          secretAccessKey: process.env.AWS_SECRET_KEY,
        },
      })
    : null;

/**
 * @swagger
 * tags:
 *   name: Mammograms
 *   description: Mammogram image management
 */

/**
 * @swagger
 * /api/v1/mammogram/upload:
 *   post:
 *     summary: Upload a new mammogram
 *     tags: [Mammograms]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               mammogram:
 *                 type: string
 *                 format: binary
 *                 description: The mammogram image file (JPEG, PNG, or DICOM)
 *               patientId:
 *                 type: string
 *                 description: The ID of the patient (required)
 *               notes:
 *                 type: string
 *                 description: Additional notes about the mammogram
 *               laterality:
 *                 type: string
 *                 enum: [L, R, B]
 *                 description: Laterality of the mammogram (Left, Right, or Bilateral)
 *               viewPosition:
 *                 type: string
 *                 enum: [CC, MLO, ML, LM, AT]
 *                 description: View position of the mammogram (e.g., Cranio-Caudal, Medio-Lateral Oblique)
 *     responses:
 *       201:
 *         description: Mammogram uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Mammogram'
 *       400:
 *         description: Invalid input or file
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "No file uploaded"
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Unauthorized"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Failed to upload mammogram"
 */
export const uploadMammogram = async (req, res) => {
  try {
    // Validate required fields
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const { patientId, notes, laterality, viewPosition } = req.body;
    if (!patientId) {
      return res.status(400).json({ error: "Patient ID is required" });
    }

    console.log("Uploaded file MIME type:", req.file.mimetype);

    // Validate file type - include DICOM extensions
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/dicom",
      "application/octet-stream", // For generic DICOM files
      "application/dicom", // Alternative DICOM MIME type
    ];

    // Also check file extension for DICOM
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    const isDicom =
      req.file.mimetype === "image/dicom" ||
      req.file.mimetype === "application/octet-stream" ||
      req.file.mimetype === "application/dicom" ||
      fileExtension === ".dcm";

    if (!allowedTypes.includes(req.file.mimetype) && !isDicom) {
      return res.status(400).json({
        error: "Only JPEG, PNG, or DICOM images are allowed",
        receivedType: req.file.mimetype,
      });
    }

    // Validate file size (e.g., 20MB max for DICOM)
    const maxSize = isDicom ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
    if (req.file.size > maxSize) {
      return res.status(400).json({
        error: `File size exceeds ${maxSize / (1024 * 1024)}MB limit`,
      });
    }

    // Generate secure filename and paths
    const uniqueId = uuidv4();
    const sanitizedFilename = `mammo_${patientId}_${laterality || "unknown"}_${
      viewPosition || "unknown"
    }_${uniqueId}${fileExtension}`;

    // Create directory structure
    const uploadDate = new Date();
    const yearMonth = `${uploadDate.getFullYear()}-${(uploadDate.getMonth() + 1)
      .toString()
      .padStart(2, "0")}`;
    const patientFolder = `patient_${patientId}`;
    const localBasePath = path.join(
      process.env.UPLOAD_DIR,
      "mammograms",
      yearMonth,
      patientFolder
    );

    // Ensure directories exist
    if (process.env.STORAGE_TYPE === "local") {
      fs.mkdirSync(localBasePath, { recursive: true });
    }

    // Process the image based on type
    let processedFilePath;
    let metadata = {};

    if (isDicom) {
      // Handle DICOM files (regardless of MIME type)
      try {
        metadata = await mammogramMetadataParser(req.file.path);

        // Anonymize the file
        const anonymizedPath = path.join(
          localBasePath,
          `anon_${sanitizedFilename}`
        );
        await anonymizeDicomFile(req.file.path, anonymizedPath);

        processedFilePath = anonymizedPath;
      } catch (dicomError) {
        console.error("DICOM processing failed:", dicomError);
        throw new Error("Invalid DICOM file format");
      } finally {
        // Always clean up original file
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      }
    } else {
      // Process standard images
      processedFilePath = path.join(localBasePath, sanitizedFilename);
      try {
        await sharp(req.file.path)
          .jpeg({ quality: 90, mozjpeg: true })
          .resize(3000, 4000, { fit: "inside", withoutEnlargement: true })
          .toFile(processedFilePath);
      } catch (imageError) {
        console.error("Image processing failed:", imageError);
        throw new Error("Invalid image file format");
      } finally {
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
      }
    }

    // If using S3, upload to cloud storage
    let storagePath = processedFilePath;
    if (process.env.STORAGE_TYPE === "s3") {
      const s3Key = `mammograms/${yearMonth}/${patientFolder}/${sanitizedFilename}`;
      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: s3Key,
          Body: fs.createReadStream(processedFilePath),
          ContentType: req.file.mimetype,
          Metadata: metadata,
        })
      );
      storagePath = s3Key;

      // Optionally remove local file after S3 upload
      if (process.env.CLEAN_LOCAL_UPLOADS === "true") {
        fs.unlinkSync(processedFilePath);
      }
    }

    // Create database record
    const newMammogram = new Mammogram({
      patientId,
      originalFilename: req.file.originalname,
      storagePath,
      storageType: process.env.STORAGE_TYPE || "local",
      notes: notes || "",
      uploadedBy: req.user.id,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      metadata: {
        laterality,
        viewPosition,
        ...metadata,
      },
      uploadDate,
      checksum: await calculateFileChecksum(processedFilePath), // For data integrity
    });

    await newMammogram.save();

    // Return enriched response
    res.status(201).json({
      success: true,
      mammogram: newMammogram,
      previewUrl: generatePreviewUrl(newMammogram), // Helper function to generate access URL
    });
  } catch (err) {
    console.error("Error uploading mammogram:", err);

    // Clean up files if error occurred
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    if (processedFilePath && fs.existsSync(processedFilePath)) {
      fs.unlinkSync(processedFilePath);
    }

    res.status(500).json({
      error: "Failed to upload mammogram",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};

/**
 * Helper function to calculate file checksum
 * @param {string} filePath - Path to the file
 * @returns {Promise<string>} SHA-256 hash of the file
 */
async function calculateFileChecksum(filePath) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/**
 * Helper function to generate access URL based on storage type
 * @param {Object} mammogram - Mammogram document
 * @returns {string} Access URL for the mammogram
 */
function generatePreviewUrl(mammogram) {
  if (mammogram.storageType === "s3") {
    return `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${mammogram.storagePath}`;
  }
  return `${process.env.APP_URL}/api/mammograms/${mammogram._id}/preview`;
}
