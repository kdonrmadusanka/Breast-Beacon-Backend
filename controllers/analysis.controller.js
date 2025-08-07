// controllers/analysis.controller.js
import Mammogram from "../models/Mammogram.js";
import { detectLesions } from "../services/aiService.js";
import { calculateBreastDensity } from "../utils/breastAnalysis.js";
import { generateBiradsScore } from "../utils/biradsCalculator.js";

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
 *       404:
 *         description: Mammogram not found
 *       500:
 *         description: Analysis failed
 */
export const analyzeMammogram = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Get and validate mammogram
    const mammogram = await Mammogram.findById(id);
    if (!mammogram) {
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
      return res.status(403).json({
        success: false,
        error: "Access denied",
      });
    }

    // 3. Get local image path (implementation depends on storage system)
    const imagePath = await getLocalImagePath(mammogram);

    // 4. Run AI analysis pipeline
    const [lesions, density] = await Promise.all([
      detectLesions(imagePath), // Python Faster-RCNN service
      calculateBreastDensity(imagePath), // Separate density analysis
    ]);

    // 5. Generate BI-RADS scores for each finding
    const findings = lesions.map((lesion) => ({
      type: classifyLesionType(lesion), // Helper function
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

    // 8. Update mammogram with analysis results
    const updatedMammogram = await Mammogram.findByIdAndUpdate(
      id,
      {
        $set: {
          "analysisResults.densityCategory": density.category,
          "analysisResults.findings": findings,
          "analysisResults.riskScore": riskScore,
          "analysisResults.recommendations": recommendations,
          "analysisResults.processedDate": new Date(),
          "analysisResults.processedBy": req.user.id,
          "analysisResults.aiModelsUsed": [
            {
              name: "Faster-RCNN VGG16",
              version: "1.0",
              timestamp: new Date(),
            },
          ],
          "analysisResults.technicalQuality": assessImageQuality(imagePath),
        },
      },
      { new: true }
    ).populate("patientId uploadedBy");

    res.status(200).json({
      success: true,
      data: updatedMammogram,
    });
  } catch (error) {
    console.error("Analysis error:", error);
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
  if (mammogram.storageType === "local") {
    return path.join(process.env.UPLOAD_DIR, mammogram.storagePath);
  }
  // For cloud storage, download to temp location
  const tempPath = `/tmp/${mammogram._id}${path.extname(
    mammogram.originalFilename
  )}`;
  await downloadFromCloudStorage(mammogram.storagePath, tempPath);
  return tempPath;
}
