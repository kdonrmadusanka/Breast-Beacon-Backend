/**
 * @swagger
 * components:
 *   schemas:
 *     ImageQualityAssessment:
 *       type: object
 *       properties:
 *         overallScore:
 *           type: number
 *           minimum: 0
 *           maximum: 100
 *         technicalFactors:
 *           type: object
 *           properties:
 *             positioning:
 *               type: string
 *               enum: [excellent, adequate, inadequate]
 *             compression:
 *               type: string
 *               enum: [optimal, adequate, insufficient]
 *             exposure:
 *               type: string
 *               enum: [optimal, adequate, overexposed, underexposed]
 *             sharpness:
 *               type: string
 *               enum: [excellent, adequate, blurred]
 *             noise:
 *               type: string
 *               enum: [optimal, acceptable, excessive]
 *         artifacts:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [motion, detector, processing, foreign-object]
 *               severity:
 *                 type: string
 *                 enum: [mild, moderate, severe]
 *               location:
 *                 type: string
 *         qualityFlags:
 *           type: array
 *           items:
 *             type: string
 *             enum: [repeat-needed, diagnostic, limited-interpretation, acceptable]
 *         metrics:
 *           type: object
 *           properties:
 *             contrastToNoiseRatio:
 *               type: number
 *             signalToNoiseRatio:
 *               type: number
 *             compressionThickness:
 *               type: number
 *             pectoralMuscleVisibility:
 *               type: string
 *               enum: [full, partial, none]
 *             nippleInProfile:
 *               type: boolean
 */

import { analyzeImageMetrics } from "../services/imageAnalysisService.js";
import { ViewPosition, Laterality } from "../enums/mammogramEnums.js";

/**
 * Assess mammogram image quality
 * @param {Object} dicomMetadata - Extracted DICOM metadata
 * @param {string} imagePath - Path to DICOM image
 * @returns {Promise<Object>} Quality assessment results
 */
export const assessMammogramQuality = async (dicomMetadata, imagePath) => {
  // 1. Analyze technical factors from DICOM metadata
  const technicalAssessment = assessTechnicalFactors(dicomMetadata);

  // 2. Perform image analysis
  const imageMetrics = await analyzeImageMetrics(imagePath);

  // 3. Detect artifacts and positioning
  const artifactDetection = await detectArtifacts(imagePath);

  // 4. Evaluate positioning (requires view and laterality)
  const positioning = evaluatePositioning(
    imagePath,
    dicomMetadata.mammogramInfo.viewPosition,
    dicomMetadata.mammogramInfo.laterality
  );

  // 5. Calculate overall score
  const overallScore = calculateQualityScore(
    technicalAssessment,
    imageMetrics,
    artifactDetection,
    positioning
  );

  // 6. Determine quality flags
  const qualityFlags = determineQualityFlags(overallScore, artifactDetection);

  return {
    overallScore,
    technicalFactors: {
      ...technicalAssessment,
      positioning,
    },
    artifacts: artifactDetection.artifacts,
    metrics: imageMetrics,
    qualityFlags,
  };
};

/**
 * Assess technical factors from DICOM metadata
 */
function assessTechnicalFactors(metadata) {
  const { technicalInfo } = metadata;
  const factors = {};

  // Evaluate exposure
  if (technicalInfo.kvp > 30 && technicalInfo.kvp < 34) {
    factors.exposure =
      technicalInfo.exposureInuAs > 100 ? "optimal" : "adequate";
  } else {
    factors.exposure =
      technicalInfo.exposureInuAs > 120 ? "overexposed" : "underexposed";
  }

  // Evaluate compression (estimated from thickness)
  if (technicalInfo.compressionThickness < 45) {
    factors.compression = "optimal";
  } else if (technicalInfo.compressionThickness < 60) {
    factors.compression = "adequate";
  } else {
    factors.compression = "insufficient";
  }

  // Evaluate sharpness (from focal spot size)
  factors.sharpness =
    technicalInfo.focalSpotSize[0] <= 0.3
      ? "excellent"
      : technicalInfo.focalSpotSize[0] <= 0.5
      ? "adequate"
      : "blurred";

  // Evaluate noise (from exposure and tube current)
  factors.noise =
    technicalInfo.exposureInuAs / technicalInfo.xRayTubeCurrent > 2
      ? "optimal"
      : technicalInfo.exposureInuAs / technicalInfo.xRayTubeCurrent > 1
      ? "acceptable"
      : "excessive";

  return factors;
}

/**
 * Detect image artifacts using computer vision
 */
async function detectArtifacts(imagePath) {
  // This would call your CV service to analyze the image
  const artifacts = await detectArtifactsCV(imagePath);

  // Classify artifact severity
  const classifiedArtifacts = artifacts.map((artifact) => {
    let severity;
    if (artifact.impactScore < 0.3) severity = "mild";
    else if (artifact.impactScore < 0.6) severity = "moderate";
    else severity = "severe";

    return {
      type: artifact.type,
      severity,
      location: artifact.location,
      description: getArtifactDescription(artifact.type),
    };
  });

  return {
    artifacts: classifiedArtifacts,
    hasCriticalArtifacts: artifacts.some((a) => a.impactScore > 0.5),
  };
}

/**
 * Evaluate mammogram positioning quality
 */
async function evaluatePositioning(imagePath, viewPosition, laterality) {
  const positioningResults = await analyzePositioningCV(
    imagePath,
    viewPosition,
    laterality
  );

  if (viewPosition === ViewPosition.CC) {
    // Criteria for Cranio-Caudal view
    if (
      positioningResults.pectoralMuscleVisibility === "none" &&
      positioningResults.nippleInProfile
    ) {
      return "excellent";
    }
    if (
      positioningResults.pectoralMuscleVisibility === "partial" ||
      !positioningResults.nippleInProfile
    ) {
      return "adequate";
    }
    return "inadequate";
  } else if (viewPosition === ViewPosition.MLO) {
    // Criteria for Medio-Lateral Oblique view
    if (
      positioningResults.pectoralMuscleVisibility === "full" &&
      positioningResults.inframammaryAngle > 120
    ) {
      return "excellent";
    }
    if (
      positioningResults.pectoralMuscleVisibility === "partial" &&
      positioningResults.inframammaryAngle > 90
    ) {
      return "adequate";
    }
    return "inadequate";
  }

  return "adequate"; // Default for other views
}

/**
 * Calculate overall quality score (0-100)
 */
function calculateQualityScore(technical, metrics, artifacts, positioning) {
  let score = 100;

  // Deduct for technical factors
  if (technical.exposure !== "optimal") score -= 10;
  if (technical.compression !== "optimal") score -= 5;
  if (technical.sharpness !== "excellent") score -= 5;
  if (technical.noise !== "optimal") score -= 5;

  // Deduct for positioning
  if (positioning === "adequate") score -= 10;
  if (positioning === "inadequate") score -= 25;

  // Deduct for artifacts
  artifacts.artifacts.forEach((artifact) => {
    if (artifact.severity === "mild") score -= 2;
    else if (artifact.severity === "moderate") score -= 5;
    else if (artifact.severity === "severe") score -= 15;
  });

  // Deduct for poor metrics
  if (metrics.contrastToNoiseRatio < 3) score -= 10;
  if (metrics.signalToNoiseRatio < 20) score -= 5;

  // Ensure score is within bounds
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Determine quality flags based on assessment
 */
function determineQualityFlags(score, artifacts) {
  const flags = [];

  if (score < 60 || artifacts.hasCriticalArtifacts) {
    flags.push("repeat-needed");
  } else if (score < 75) {
    flags.push("limited-interpretation");
  } else if (score >= 90) {
    flags.push("diagnostic");
  } else {
    flags.push("acceptable");
  }

  return flags;
}

/**
 * Get descriptive text for artifacts
 */
function getArtifactDescription(type) {
  const descriptions = {
    motion: "Patient motion blur detected",
    detector: "Detector artifact present",
    processing: "Image processing artifact",
    "foreign-object": "Foreign object in image",
    compression: "Inadequate compression marks",
    grid: "Grid lines visible",
  };
  return descriptions[type] || "Artifact detected";
}

/**
 * @swagger
 * /api/mammograms/{id}/quality:
 *   get:
 *     summary: Assess mammogram image quality
 *     tags: [Quality]
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
 *         description: Quality assessment results
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ImageQualityAssessment'
 *       404:
 *         description: Mammogram not found
 *       500:
 *         description: Quality assessment failed
 */
export const getQualityAssessment = async (req, res) => {
  try {
    const { id } = req.params;
    const mammogram = await Mammogram.findById(id);

    if (!mammogram) {
      return res.status(404).json({ error: "Mammogram not found" });
    }

    const dicomMetadata =
      mammogram.dicomMetadata || (await parseDicomFile(mammogram.filePath));
    const quality = await assessMammogramQuality(
      dicomMetadata,
      mammogram.filePath
    );

    res.json(quality);
  } catch (error) {
    console.error("Quality assessment error:", error);
    res.status(500).json({ error: "Failed to assess image quality" });
  }
};
