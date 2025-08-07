/**
 * @swagger
 * components:
 *   schemas:
 *     ClinicalRecommendation:
 *       type: object
 *       properties:
 *         type:
 *           type: string
 *           enum: [followup, biopsy, ultrasound, mri, consultation, risk-management]
 *         urgency:
 *           type: string
 *           enum: [routine, short-term, immediate]
 *         description:
 *           type: string
 *         evidence:
 *           type: array
 *           items:
 *             type: string
 *         supportingFindings:
 *           type: array
 *           items:
 *             type: string
 */

// Evidence-based recommendation rules
const RECOMMENDATION_RULES = {
  BIOPSY: {
    triggers: ["birads-4C", "birads-5", "new-mass"],
    urgency: "immediate",
    description: "Core needle biopsy recommended",
    evidence: ["NCCN Guidelines v3.2023", "ACR BI-RADS Atlas"],
  },
  MRI: {
    triggers: ["high-risk", "density-D", "birads-0"],
    urgency: "short-term",
    description: "Supplemental breast MRI recommended",
    evidence: ["ACR Appropriateness Criteria"],
  },
  ULTRASOUND: {
    triggers: ["density-C", "density-D", "asymmetry"],
    urgency: "short-term",
    description: "Diagnostic ultrasound recommended",
    evidence: ["ACR Practice Parameter"],
  },
  SURGICAL_CONSULT: {
    triggers: ["birads-5", "birads-6"],
    urgency: "immediate",
    description: "Surgical oncology consultation",
    evidence: ["NCCN Guidelines v3.2023"],
  },
  SHORT_FOLLOWUP: {
    triggers: ["birads-3", "birads-4A"],
    urgency: "short-term",
    description: "6-month follow-up mammogram",
    evidence: ["ACR BI-RADS Atlas"],
  },
  RISK_REDUCTION: {
    triggers: ["lifetime-risk>20%"],
    urgency: "routine",
    description: "Risk reduction counseling",
    evidence: ["ASCO Risk Assessment Guidelines"],
  },
};

/**
 * Generate clinical recommendations based on analysis results
 * @param {Object} params - Analysis parameters
 * @param {Array} params.findings - Lesion findings
 * @param {String} params.densityCategory - BI-RADS density
 * @param {Number} params.riskScore - Calculated risk score
 * @param {Object} params.patient - Patient data
 * @returns {Array} Array of recommendation objects
 */
export const generateClinicalRecommendations = ({
  findings,
  densityCategory,
  riskScore,
  patient,
}) => {
  const triggers = buildTriggerList(
    findings,
    densityCategory,
    riskScore,
    patient
  );
  const recommendations = [];

  // Apply recommendation rules
  if (triggers.has("birads-5") || triggers.has("birads-6")) {
    recommendations.push(buildRecommendation("BIOPSY"));
    recommendations.push(buildRecommendation("SURGICAL_CONSULT"));
  }

  if (triggers.has("birads-4C")) {
    recommendations.push(buildRecommendation("BIOPSY"));
  }

  if (triggers.has("high-risk") && densityCategory === "D") {
    recommendations.push(buildRecommendation("MRI"));
  }

  if (densityCategory === "C" || densityCategory === "D") {
    if (findings.some((f) => f.type === "asymmetry")) {
      recommendations.push(buildRecommendation("ULTRASOUND"));
    }
  }

  if (triggers.has("birads-3") || triggers.has("birads-4A")) {
    recommendations.push(buildRecommendation("SHORT_FOLLOWUP"));
  }

  if (riskScore > 20) {
    recommendations.push({
      ...buildRecommendation("RISK_REDUCTION"),
      supportingFindings: [`Calculated risk score: ${riskScore}`],
    });
  }

  // Add density-specific note if applicable
  if (["C", "D"].includes(densityCategory)) {
    recommendations.push({
      type: "note",
      description: `Breast tissue is heterogeneously dense (${densityCategory}) which may lower mammogram sensitivity`,
      evidence: ["ACR BI-RADS Atlas"],
    });
  }

  return deduplicateRecommendations(recommendations);
};

/**
 * Build trigger set based on findings and patient data
 */
function buildTriggerList(findings, densityCategory, riskScore, patient) {
  const triggers = new Set();

  // Add findings-based triggers
  findings.forEach((finding) => {
    if (finding.birads) {
      triggers.add(`birads-${finding.birads.category}`);
    }
    if (finding.type === "mass" && finding.comparison?.change === "new") {
      triggers.add("new-mass");
    }
  });

  // Add density trigger
  if (densityCategory === "D") {
    triggers.add("density-D");
  } else if (densityCategory === "C") {
    triggers.add("density-C");
  }

  // Add risk triggers
  if (riskScore > 30) {
    triggers.add("high-risk");
  }
  if (riskScore > 20) {
    triggers.add("lifetime-risk>20%");
  }

  // Add patient-specific triggers
  if (patient.familyHistory?.firstDegree) {
    triggers.add("family-history");
  }

  return triggers;
}

/**
 * Create recommendation object from rule template
 */
function buildRecommendation(ruleKey) {
  const rule = RECOMMENDATION_RULES[ruleKey];
  return {
    type: ruleKey.toLowerCase().replace(/_/g, "-"),
    urgency: rule.urgency,
    description: rule.description,
    evidence: rule.evidence,
    priority: getRecommendationPriority(rule.urgency),
  };
}

/**
 * Assign priority score for sorting
 */
function getRecommendationPriority(urgency) {
  const priorityMap = {
    immediate: 1,
    "short-term": 2,
    routine: 3,
  };
  return priorityMap[urgency] || 3;
}

/**
 * Remove duplicate recommendations
 */
function deduplicateRecommendations(recommendations) {
  const seen = new Set();
  return recommendations
    .filter((rec) => {
      const key = `${rec.type}-${rec.description}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Generate patient-friendly explanation
 */
export const generatePatientExplanation = (
  recommendations,
  language = "en"
) => {
  const explanations = [];

  recommendations.forEach((rec) => {
    let explanation = "";

    switch (rec.type) {
      case "biopsy":
        explanation = `We recommend a biopsy because: ${
          rec.supportingFindings?.join(", ") || "suspicious findings"
        }`;
        break;
      case "mri":
        explanation =
          "Additional MRI is suggested due to your breast density and risk factors";
        break;
      case "ultrasound":
        explanation =
          "An ultrasound is recommended to better evaluate areas of concern";
        break;
      default:
        explanation = rec.description;
    }

    explanations.push({
      type: rec.type,
      explanation,
      urgency: rec.urgency,
    });
  });

  return explanations;
};

export const generatePatientFriendlyExplanation = (
  recommendations = [],
  language = "en"
) => {
  const EXPLANATION_TEMPLATES = {
    biopsy: {
      base: "We recommend a biopsy because: {details}",
      details: {
        "birads-5": "findings are highly suspicious for cancer",
        "birads-4C": "there are findings that are moderately suspicious",
        "new-mass": "a new mass was found that needs evaluation",
      },
    },
    mri: {
      base: "We recommend an additional MRI because: {details}",
      details: {
        "high-risk": "you have high risk factors",
        "density-D": "you have extremely dense breast tissue",
        "birads-0": "additional imaging is needed for complete evaluation",
      },
    },
    ultrasound: {
      base: "We recommend an ultrasound because: {details}",
      details: {
        "density-C": "you have dense breast tissue",
        "density-D": "you have extremely dense breast tissue",
        asymmetry: "there are areas that need closer examination",
      },
    },
    "surgical-consult": {
      base: "We recommend seeing a breast surgeon because: {details}",
      details: {
        "birads-5": "findings are highly suspicious for cancer",
        "birads-6": "cancer has been confirmed",
      },
    },
    "short-followup": {
      base: "We recommend a 6-month follow-up because: {details}",
      details: {
        "birads-3": "findings are likely benign but should be monitored",
        "birads-4A": "there are mild concerns that should be rechecked",
      },
    },
    "risk-reduction": {
      base: "We recommend risk reduction counseling because: {details}",
      details: {
        "lifetime-risk>20%": "your calculated lifetime risk is {score}%",
      },
    },
    note: {
      base: "Important note: {details}",
      details: {
        "density-C":
          "your breast tissue is dense, which can make mammograms harder to read",
        "density-D":
          "your breast tissue is extremely dense, which can make mammograms harder to read",
      },
    },
  };

  return recommendations.map((rec) => {
    const template = EXPLANATION_TEMPLATES[rec.type] || {
      base: rec.description,
    };
    let details = "";

    // Handle special cases
    if (rec.type === "risk-reduction" && rec.supportingFindings) {
      const riskScore = rec.supportingFindings[0]?.match(/\d+/)?.[0] || "20+";
      details = template.details["lifetime-risk>20%"].replace(
        "{score}",
        riskScore
      );
    }
    // Handle density notes
    else if (rec.type === "note" && rec.description.includes("dense")) {
      const densityMatch = rec.description.match(/\(([CD])\)/);
      details = densityMatch
        ? template.details[`density-${densityMatch[1]}`]
        : rec.description;
    }
    // Default case
    else {
      details =
        rec.supportingFindings?.join(", ") ||
        Object.values(template.details || {}).join(", ") ||
        "clinical findings";
    }

    return {
      type: rec.type,
      explanation: template.base.replace("{details}", details),
      urgency: rec.urgency,
      priority: rec.priority,
    };
  });
};
