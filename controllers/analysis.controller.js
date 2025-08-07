// controllers/analysis.controller.js
import Mammogram from "../models/Mammogram.js";
import { detectLesions } from "../services/aiService.js";
import { calculateBreastDensity } from "../utils/breastAnalysis.js";
import { generateBiradsScore } from "../utils/biradsCalculator.js";
import {
  logAccess,
  logModification,
  logEvent,
} from "../services/auditLogger.js";

/**
 * @swagger
 * tags:
 *   name: Mammogram Analysis
 *   description: AI-powered mammogram analysis
 */

/**
 * @swagger
 * /api/mammograms/{id}/analyze:
 *   post:
 *     summary: Perform comprehensive mammogram analysis
 *     description: Runs AI analysis including lesion detection, density calculation, and BI-RADS scoring
 *     tags: [Mammogram Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Mammogram ID
 *     responses:
 *       200:
 *         description: Full analysis results
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Mammogram'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Mammogram not found
 *       500:
 *         description: Analysis failed
 */
export const analyzeMammogram = async (req, res) => {
  try {
    const { id } = req.params;

    // Log access attempt
    await logAccess({
      resourceType: "mammogram",
      resourceId: id,
      user: req.user,
      action: "attempt_analysis",
      req,
    });

    // 1. Get and validate mammogram
    const mammogram = await Mammogram.findById(id);
    if (!mammogram) {
      await logEvent({
        eventType: "access",
        action: "mammogram_analysis_failed",
        user: req.user,
        entityType: "mammogram",
        entityId: id,
        status: "failure",
        metadata: { reason: "not_found" },
        req,
      });
      return res.status(404).json({
        success: false,
        error: "Mammogram not found",
      });
    }

    // 2. Verify permissions
    if (
      req.user.role === "patient" &&
      !mammogram.patientId.equals(req.user.id)
    ) {
      await logSecurityEvent({
        action: "unauthorized_analysis_attempt",
        user: req.user,
        status: "failure",
        metadata: {
          attemptedAccess: id,
          patientId: mammogram.patientId.toString(),
        },
        req,
      });
      return res.status(403).json({
        success: false,
        error: "Access denied",
      });
    }

    // 3. Get local image path
    const imagePath = await getLocalImagePath(mammogram);

    // Log analysis start
    await logEvent({
      eventType: "system",
      action: "mammogram_analysis_started",
      user: req.user,
      entityType: "mammogram",
      entityId: id,
      metadata: {
        imageSize: mammogram.fileSize,
        imageType: mammogram.fileType,
        originalFilename: mammogram.originalFilename,
      },
      req,
    });

    // 4. Run AI analysis pipeline
    let analysisResults;
    try {
      const [lesions, density] = await Promise.all([
        detectLesions(imagePath),
        calculateBreastDensity(imagePath),
      ]);

      // 5. Generate BI-RADS scores for each finding
      const findings = lesions.map((lesion) => ({
        type: classifyLesionType(lesion),
        location: calculateLesionLocation(lesion, mammogram.metadata),
        size: calculateLesionSize(lesion),
        characteristics: analyzeLesionCharacteristics(lesion),
        confidence: lesion.score * 100,
        birads: generateBiradsScore(lesion),
        aiAnalysis: {
          modelVersion: "vgg16_frcnn_cad_1.0",
          confidenceScores: {
            benign: lesion.benignProbability || 0,
            malignant: lesion.malignantProbability || 0,
          },
          features: extractLesionFeatures(lesion),
        },
      }));

      // 6. Calculate overall risk score
      const riskScore = calculateOverallRiskScore(findings, density);

      // 7. Generate recommendations
      const recommendations = generateClinicalRecommendations(
        findings,
        riskScore
      );

      analysisResults = {
        densityCategory: density.category,
        findings,
        riskScore,
        recommendations,
        processedDate: new Date(),
        processedBy: req.user.id,
        aiModelsUsed: [
          {
            name: "Faster-RCNN VGG16",
            version: "1.0",
            timestamp: new Date(),
          },
        ],
        technicalQuality: assessImageQuality(imagePath),
      };
    } catch (analysisError) {
      await logEvent({
        eventType: "system",
        action: "mammogram_analysis_failed",
        user: req.user,
        entityType: "mammogram",
        entityId: id,
        status: "failure",
        metadata: {
          error: analysisError.message,
          stack:
            process.env.NODE_ENV === "development"
              ? analysisError.stack
              : undefined,
        },
        req,
      });
      throw analysisError;
    }

    // 8. Update mammogram with analysis results
    const updatedMammogram = await Mammogram.findByIdAndUpdate(
      id,
      { $set: { analysisResults } },
      { new: true }
    ).populate("patientId uploadedBy");

    // Log successful modification
    await logModification({
      entityType: "mammogram",
      entityId: id,
      user: req.user,
      changes: [
        {
          field: "analysisResults",
          oldValue: mammogram.analysisResults || null,
          newValue: analysisResults,
        },
      ],
      req,
    });

    // Log successful analysis completion
    await logEvent({
      eventType: "system",
      action: "mammogram_analysis_completed",
      user: req.user,
      entityType: "mammogram",
      entityId: id,
      status: "success",
      metadata: {
        findingsCount: analysisResults.findings.length,
        highestBirads: Math.max(
          ...analysisResults.findings.map((f) => f.birads)
        ),
        densityCategory: analysisResults.densityCategory,
        riskScore: analysisResults.riskScore,
      },
      req,
    });

    res.status(200).json({
      success: true,
      data: updatedMammogram,
    });
  } catch (error) {
    console.error("Analysis error:", error);

    // Log the error
    await logEvent({
      eventType: "system",
      action: "mammogram_analysis_error",
      user: req.user,
      status: "failure",
      metadata: {
        error: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      req,
    });

    res.status(500).json({
      success: false,
      error: "Mammogram analysis failed",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Helper function to get local image path
async function getLocalImagePath(mammogram) {
  try {
    if (mammogram.storageType === "local") {
      return path.join(process.env.UPLOAD_DIR, mammogram.storagePath);
    }
    // For cloud storage, download to temp location
    const tempPath = `/tmp/${mammogram._id}${path.extname(
      mammogram.originalFilename
    )}`;
    await downloadFromCloudStorage(mammogram.storagePath, tempPath);
    return tempPath;
  } catch (error) {
    await logEvent({
      eventType: "system",
      action: "image_retrieval_failed",
      status: "failure",
      metadata: {
        mammogramId: mammogram._id,
        storageType: mammogram.storageType,
        error: error.message,
      },
    });
    throw error;
  }
}
