/**
 * @swagger
 * components:
 *   schemas:
 *     BiradsAssessment:
 *       type: object
 *       properties:
 *         category:
 *           type: string
 *           enum: ["0", "1", "2", "3", "4A", "4B", "4C", "5", "6"]
 *           description: BI-RADS assessment category
 *         description:
 *           type: string
 *           description: Explanation of the assessment
 *         followup:
 *           type: string
 *           description: Recommended follow-up timeframe
 */

/**
 * Calculate BI-RADS score for a detected lesion
 * @param {Object} lesion - Lesion object from AI analysis
 * @returns {Object} BI-RADS assessment
 */
export const generateBiradsScore = (lesion) => {
  // Extract features from the lesion
  const { score, characteristics } = lesion;
  const { shape, margin, density } = characteristics || {};

  // Score based on malignancy probability
  let category, description;

  if (score < 0.1) {
    // Essentially no chance of malignancy
    category = "1";
    description = "Negative - No significant abnormality";
  } else if (score < 0.3) {
    // Benign appearance
    category = "2";
    description = "Benign finding";
  } else if (score < 0.5) {
    // Probably benign
    category = "3";
    description = "Probably benign finding - Short-term follow-up suggested";
  } else if (score < 0.7) {
    // Suspicious
    if (margin === "spiculated" || shape === "irregular") {
      category = "4C";
      description = "High suspicion for malignancy";
    } else {
      category = "4A";
      description = "Low suspicion for malignancy";
    }
  } else if (score < 0.9) {
    // Highly suspicious
    category = "4B";
    description = "Moderate suspicion for malignancy";
  } else {
    // Almost certainly malignant
    category = "5";
    description = "Highly suggestive of malignancy";
  }

  // Special case for known biopsy-proven malignancy
  if (lesion.biopsyProvenMalignant) {
    category = "6";
    description = "Known biopsy-proven malignancy";
  }

  // Determine followup timeframe
  const followup = getFollowupTimeframe(category);

  return {
    category,
    description,
    followup,
    characteristics: {
      shape,
      margin,
      density,
    },
  };
};

/**
 * Get recommended follow-up timeframe based on BI-RADS category
 * @param {String} biradsCategory - BI-RADS category
 * @returns {String} Recommended follow-up
 */
const getFollowupTimeframe = (biradsCategory) => {
  const followupMap = {
    0: "Additional imaging needed",
    1: "Routine screening (1-2 years)",
    2: "Routine screening (1-2 years)",
    3: "6-month follow-up",
    "4A": "Diagnostic workup within 1-3 months",
    "4B": "Diagnostic workup within 1 month",
    "4C": "Diagnostic workup within 2 weeks",
    5: "Immediate biopsy recommended",
    6: "Already under treatment",
  };
  return followupMap[biradsCategory] || "Consult radiologist";
};

/**
 * Calculate overall BI-RADS assessment for the mammogram
 * @param {Array} findings - All lesion findings
 * @param {Object} density - Density analysis results
 * @returns {Object} Overall assessment
 */
export const calculateOverallAssessment = (findings, density) => {
  if (findings.length === 0) {
    return {
      category: density.category === "D" ? "0" : "1",
      description:
        density.category === "D"
          ? "Need additional imaging due to extreme density"
          : "Negative",
    };
  }

  // Get the highest BI-RADS category from findings
  const highestCategory = findings.reduce((max, finding) => {
    const current = parseInt(finding.birads.category);
    return current > max ? current : max;
  }, 0);

  // Adjust for extremely dense tissue
  let finalCategory = highestCategory.toString();
  if (density.category === "D" && highestCategory < 3) {
    finalCategory = "0"; // Need additional imaging
  }

  return {
    category: finalCategory,
    description: `Most significant finding: BI-RADS ${finalCategory}`,
    limitingFactor:
      density.category === "D"
        ? "Extremely dense tissue may obscure small masses"
        : null,
  };
};
