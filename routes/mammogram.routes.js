import express from "express";
import { multerInstance } from "../middleware/file-upload.js";
import { uploadMammogram } from "../controllers/mammogram.controller.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = express.Router();

/**
 * @swagger
 * /api/mammograms/upload:
 *   post:
 *     summary: Upload a mammogram image
 *     description: Upload a mammogram image (JPEG, PNG, or DICOM format) with patient metadata
 *     tags: [Mammograms]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - mammogram
 *               - patientId
 *             properties:
 *               mammogram:
 *                 type: string
 *                 format: binary
 *                 description: Mammogram image file (JPEG, PNG, or DICOM)
 *               patientId:
 *                 type: string
 *                 description: ID of the patient
 *               notes:
 *                 type: string
 *                 description: Additional notes about the mammogram
 *               laterality:
 *                 type: string
 *                 enum: [L, R, B]
 *                 description: Breast laterality (Left, Right, or Both)
 *               viewPosition:
 *                 type: string
 *                 enum: [CC, MLO, ML, LM, AT]
 *                 description: View position of the mammogram
 *     responses:
 *       201:
 *         description: Mammogram uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Mammogram'
 *       400:
 *         description: Invalid input (missing fields, wrong file type, etc.)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                 details:
 *                   type: string
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       413:
 *         description: File too large
 *       500:
 *         description: Server error
 */
router.post(
  "/upload",
  authenticate,
  authorize("radiologist", "technician", "admin", "patient"),
  multerInstance.single("mammogram"),
  uploadMammogram
);

export default router;
