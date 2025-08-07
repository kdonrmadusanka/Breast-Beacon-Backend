/**
 * @swagger
 * components:
 *   schemas:
 *     LesionClassification:
 *       type: object
 *       properties:
 *         type:
 *           type: string
 *           enum: [mass, calcification, asymmetry, distortion, lymph-node]
 *         location:
 *           type: object
 *           properties:
 *             laterality:
 *               type: string
 *               enum: [L, R]
 *             quadrant:
 *               type: string
 *               enum: [UOQ, UIQ, LOQ, LIQ, central]
 *             clockPosition:
 *               type: number
 *               min: 1
 *               max: 12
 *             depth:
 *               type: string
 *               enum: [anterior, middle, posterior, unknown]
 *         characteristics:
 *           type: object
 *           properties:
 *             shape:
 *               type: string
 *               enum: [round, oval, irregular, lobulated, unknown]
 *             margin:
 *               type: string
 *               enum: [circumscribed, microlobulated, obscured, indistinct, spiculated]
 *             density:
 *               type: string
 *               enum: [high, equal, low, fat-containing]
 *             distribution:
 *               type: string
 *               enum: [clustered, linear, segmental, regional, diffuse]
 *         suspiciousFeatures:
 *           type: array
 *           items:
 *             type: string
 *             enum: [architectural-distortion, skin-retraction, nipple-retraction, trabecular-thickening, skin-thickening]
 */

// Feature extraction algorithms
const SHAPE_DETECTION_PARAMS = {
  round: { circularity: [0.9, 1.1], aspectRatio: [0.9, 1.1] },
  oval: { circularity: [0.7, 0.9], aspectRatio: [1.2, 1.5] },
  irregular: { circularity: [0, 0.6], aspectRatio: [1.5, 5] },
  lobulated: { circularity: [0.6, 0.8], aspectRatio: [1.1, 1.8] },
};

const MARGIN_DETECTION_PARAMS = {
  circumscribed: { edgeSharpness: [0.8, 1.0], textureContrast: [0.9, 1.0] },
  spiculated: { edgeSharpness: [0, 0.3], textureContrast: [0, 0.4] },
  microlobulated: { edgeSharpness: [0.4, 0.6], textureContrast: [0.5, 0.7] },
  obscured: { edgeSharpness: [0.3, 0.5], textureContrast: [0.3, 0.6] },
  indistinct: { edgeSharpness: [0.2, 0.4], textureContrast: [0.2, 0.5] },
};

/**
 * Classify a detected lesion based on AI output and image features
 * @param {Object} lesion - Raw lesion data from AI detection
 * @param {Object} metadata - Mammogram metadata
 * @returns {Object} Detailed lesion classification
 */
export const classifyLesion = (lesion, metadata) => {
  // 1. Determine lesion type
  const type = determineLesionType(lesion);

  // 2. Calculate precise location
  const location = calculateLesionLocation(lesion, metadata);

  // 3. Analyze morphological characteristics
  const characteristics = analyzeLesionCharacteristics(lesion);

  // 4. Identify suspicious features
  const suspiciousFeatures = detectSuspiciousFeatures(lesion);

  // 5. Calculate confidence scores
  const confidenceScores = calculateConfidenceScores(lesion, characteristics);

  return {
    type,
    location,
    characteristics,
    suspiciousFeatures,
    confidenceScores,
    aiMetadata: {
      modelUsed: "Faster-RCNN VGG16",
      modelVersion: "1.0",
      detectionTimestamp: new Date(),
    },
  };
};

/**
 * Determine lesion type based on features
 */
function determineLesionType(lesion) {
  const { features } = lesion;

  if (features.calcificationScore > 0.8) {
    return "calcification";
  }
  if (features.architecturalDistortion) {
    return "distortion";
  }
  if (features.asymmetryScore > 0.7) {
    return "asymmetry";
  }
  if (features.lymphNodeCharacteristics) {
    return "lymph-node";
  }
  return "mass"; // Default to mass if none specific
}

/**
 * Calculate precise lesion location
 */
function calculateLesionLocation(lesion, metadata) {
  const { bbox, imageDimensions } = lesion;
  const [x1, y1, x2, y2] = bbox;
  const centerX = (x1 + x2) / 2;
  const centerY = (y1 + y2) / 2;

  // Determine quadrant (assuming CC view)
  let quadrant;
  const xRatio = centerX / imageDimensions.width;
  const yRatio = centerY / imageDimensions.height;

  if (xRatio > 0.6) {
    quadrant = yRatio < 0.5 ? "UOQ" : "LOQ";
  } else if (xRatio < 0.4) {
    quadrant = yRatio < 0.5 ? "UIQ" : "LIQ";
  } else {
    quadrant = "central";
  }

  // Calculate clock position (for MLO view)
  let clockPosition;
  if (metadata.viewPosition === "MLO") {
    const angle = Math.atan2(
      centerY - imageDimensions.height / 2,
      centerX - imageDimensions.width / 2
    );
    clockPosition = Math.round(((angle + Math.PI) / (Math.PI * 2)) * 12) || 12;
  }

  // Estimate depth
  let depth;
  if (metadata.viewPosition === "MLO") {
    const depthRatio = centerY / imageDimensions.height;
    depth =
      depthRatio < 0.3 ? "anterior" : depthRatio > 0.7 ? "posterior" : "middle";
  }

  return {
    laterality: metadata.laterality,
    quadrant,
    clockPosition,
    depth: depth || "unknown",
    coordinates: { x: centerX, y: centerY },
  };
}

/**
 * Analyze lesion morphological characteristics
 */
function analyzeLesionCharacteristics(lesion) {
  const { shapeFeatures, marginFeatures } = lesion;

  // Determine shape
  let shape;
  for (const [shapeType, params] of Object.entries(SHAPE_DETECTION_PARAMS)) {
    if (
      shapeFeatures.circularity >= params.circularity[0] &&
      shapeFeatures.circularity <= params.circularity[1] &&
      shapeFeatures.aspectRatio >= params.aspectRatio[0] &&
      shapeFeatures.aspectRatio <= params.aspectRatio[1]
    ) {
      shape = shapeType;
      break;
    }
  }
  shape = shape || "irregular";

  // Determine margin
  let margin;
  for (const [marginType, params] of Object.entries(MARGIN_DETECTION_PARAMS)) {
    if (
      marginFeatures.edgeSharpness >= params.edgeSharpness[0] &&
      marginFeatures.edgeSharpness <= params.edgeSharpness[1] &&
      marginFeatures.textureContrast >= params.textureContrast[0] &&
      marginFeatures.textureContrast <= params.textureContrast[1]
    ) {
      margin = marginType;
      break;
    }
  }
  margin = margin || "indistinct";

  // Determine density
  let density;
  if (lesion.densityRelativeToParenchyma > 1.2) {
    density = "high";
  } else if (lesion.densityRelativeToParenchyma < 0.8) {
    density = "low";
  } else if (lesion.fatContent > 0.7) {
    density = "fat-containing";
  } else {
    density = "equal";
  }

  // Determine calcification distribution if applicable
  let distribution;
  if (lesion.type === "calcification") {
    if (lesion.features.clusterDensity > 0.8) {
      distribution = "clustered";
    } else if (lesion.features.linearity > 0.7) {
      distribution = "linear";
    } else if (lesion.features.segmentalDistribution) {
      distribution = "segmental";
    } else {
      distribution = "regional";
    }
  }

  return {
    shape,
    margin,
    density,
    distribution,
    size: {
      width: lesion.widthMM.toFixed(1),
      height: lesion.heightMM.toFixed(1),
      depth: lesion.depthMM?.toFixed(1) || null,
    },
  };
}

/**
 * Detect suspicious secondary features
 */
function detectSuspiciousFeatures(lesion) {
  const features = [];
  const { secondaryFeatures } = lesion;

  if (secondaryFeatures.architecturalDistortion) {
    features.push("architectural-distortion");
  }
  if (secondaryFeatures.skinRetraction) {
    features.push("skin-retraction");
  }
  if (secondaryFeatures.nippleRetraction) {
    features.push("nipple-retraction");
  }
  if (secondaryFeatures.trabecularThickening) {
    features.push("trabecular-thickening");
  }
  if (secondaryFeatures.skinThickening) {
    features.push("skin-thickening");
  }

  return features;
}

/**
 * Calculate confidence scores for classification
 */
function calculateConfidenceScores(lesion, characteristics) {
  const { detectionScore } = lesion;
  const { shape, margin } = characteristics;

  // Base confidence on detection score
  let confidence = detectionScore * 0.8;

  // Increase confidence for well-defined features
  if (shape === "round" || shape === "oval") confidence += 0.1;
  if (margin === "circumscribed") confidence += 0.1;

  // Decrease confidence for indeterminate features
  if (shape === "irregular") confidence -= 0.05;
  if (margin === "indistinct") confidence -= 0.05;

  // Ensure within bounds
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    overall: confidence,
    type: detectionScore * 0.9,
    shape: shape === "irregular" ? 0.7 : 0.9,
    margin: margin === "indistinct" ? 0.6 : 0.85,
  };
}

/**
 * Generate standardized description for reports
 */
export const generateLesionDescription = (classification) => {
  const { type, location, characteristics } = classification;
  const sizeDesc = `${characteristics.size.width} × ${characteristics.size.height} mm`;

  let description = `${sizeDesc} ${type} in the ${location.quadrant} quadrant`;

  if (location.clockPosition) {
    description += ` at ${location.clockPosition} o'clock position`;
  }

  description += ` with ${characteristics.shape} shape and ${characteristics.margin} margins`;

  if (characteristics.density !== "equal") {
    description += `, ${characteristics.density} density compared to parenchyma`;
  }

  if (classification.suspiciousFeatures.length > 0) {
    description += `. Associated features: ${classification.suspiciousFeatures.join(
      ", "
    )}`;
  }

  return description;
};
