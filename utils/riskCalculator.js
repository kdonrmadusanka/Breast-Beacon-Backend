/**
 * @swagger
 * components:
 *   schemas:
 *     RiskAssessment:
 *       type: object
 *       properties:
 *         score:
 *           type: number
 *           description: 0-100 risk score
 *         category:
 *           type: string
 *           enum: [low, medium, high, very-high]
 *         factors:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               factor:
 *                 type: string
 *               contribution:
 *                 type: number
 *         recommendations:
 *           type: array
 *           items:
 *             type: string
 */

// Risk factor weights (based on Gail model and Tyrer-Cuzick model)
const RISK_FACTORS = {
  AGE: { base: 0.1, perDecade: 0.5 },
  DENSITY: { A: 0.1, B: 0.2, C: 0.3, D: 0.4 },
  LESION_CHARACTERISTICS: {
    benign: 0.1,
    "4A": 0.3,
    "4B": 0.5,
    "4C": 0.7,
    5: 0.9,
  },
  FAMILY_HISTORY: {
    none: 0,
    secondDegree: 0.2,
    firstDegree: 0.4,
    multipleFirstDegree: 0.6,
  },
  HORMONAL: {
    earlyMenarche: 0.1,
    lateMenopause: 0.1,
    nulliparous: 0.15,
    firstChildAfter30: 0.1,
  },
};

/**
 * Calculate comprehensive breast cancer risk score
 * @param {Object} patient - Patient document
 * @param {Array} findings - Lesion findings from analysis
 * @param {String} densityCategory - BI-RADS density category
 * @returns {Object} Risk assessment
 */
export const calculateBreastCancerRisk = (
  patient,
  findings,
  densityCategory
) => {
  let score = 0;
  const factors = [];

  // 1. Age factor
  const ageFactor = calculateAgeFactor(patient.dateOfBirth);
  score += ageFactor.score;
  factors.push(ageFactor);

  // 2. Breast density factor
  const densityFactor = {
    factor: "Breast density",
    contribution: RISK_FACTORS.DENSITY[densityCategory] * 20,
  };
  score += densityFactor.contribution;
  factors.push(densityFactor);

  // 3. Lesion characteristics
  const lesionFactors = calculateLesionFactors(findings);
  score += lesionFactors.score;
  factors.push(...lesionFactors.factors);

  // 4. Family history
  const familyHistoryFactor = calculateFamilyHistoryFactor(
    patient.familyHistory
  );
  score += familyHistoryFactor.score;
  factors.push(familyHistoryFactor);

  // 5. Hormonal/reproductive factors
  const hormonalFactors = calculateHormonalFactors(patient.reproductiveHistory);
  score += hormonalFactors.score;
  factors.push(...hormonalFactors.factors);

  // Cap score at 100
  score = Math.min(100, Math.round(score));

  // Determine risk category
  const category = getRiskCategory(score);

  // Generate recommendations
  const recommendations = generateRiskBasedRecommendations(
    score,
    category,
    findings
  );

  return {
    score,
    category,
    factors,
    recommendations,
  };
};

// Helper functions
function calculateAgeFactor(dateOfBirth) {
  const age = new Date().getFullYear() - new Date(dateOfBirth).getFullYear();
  const ageScore =
    RISK_FACTORS.AGE.base + Math.floor(age / 10) * RISK_FACTORS.AGE.perDecade;
  return {
    factor: "Age",
    contribution: ageScore * 15,
    details: `${age} years`,
  };
}

function calculateLesionFactors(findings) {
  let totalScore = 0;
  const factors = [];

  findings.forEach((finding, index) => {
    const birads = finding.birads?.category || "3";
    let lesionScore = 0;

    if (birads.startsWith("4A"))
      lesionScore = RISK_FACTORS.LESION_CHARACTERISTICS["4A"];
    else if (birads.startsWith("4B"))
      lesionScore = RISK_FACTORS.LESION_CHARACTERISTICS["4B"];
    else if (birads.startsWith("4C"))
      lesionScore = RISK_FACTORS.LESION_CHARACTERISTICS["4C"];
    else if (birads === "5")
      lesionScore = RISK_FACTORS.LESION_CHARACTERISTICS["5"];
    else if (finding.type === "calcification") lesionScore = 0.2;

    const contribution = lesionScore * 25;
    totalScore += contribution;

    factors.push({
      factor: `Lesion ${index + 1} (${finding.type}, BI-RADS ${birads})`,
      contribution,
      details: finding.characteristics,
    });
  });

  return {
    score: totalScore,
    factors,
  };
}

function calculateFamilyHistoryFactor(familyHistory) {
  let score = 0;
  let details = "No family history";

  if (familyHistory?.multipleFirstDegree) {
    score = RISK_FACTORS.FAMILY_HISTORY.multipleFirstDegree;
    details = "Multiple first-degree relatives";
  } else if (familyHistory?.firstDegree) {
    score = RISK_FACTORS.FAMILY_HISTORY.firstDegree;
    details = "First-degree relative";
  } else if (familyHistory?.secondDegree) {
    score = RISK_FACTORS.FAMILY_HISTORY.secondDegree;
    details = "Second-degree relative";
  }

  return {
    factor: "Family history",
    contribution: score * 20,
    details,
  };
}

function calculateHormonalFactors(reproductiveHistory) {
  const factors = [];
  let totalScore = 0;

  if (reproductiveHistory?.earlyMenarche) {
    const contribution = RISK_FACTORS.HORMONAL.earlyMenarche * 10;
    totalScore += contribution;
    factors.push({
      factor: "Early menarche (<12 years)",
      contribution,
    });
  }

  if (reproductiveHistory?.lateMenopause) {
    const contribution = RISK_FACTORS.HORMONAL.lateMenopause * 10;
    totalScore += contribution;
    factors.push({
      factor: "Late menopause (>55 years)",
      contribution,
    });
  }

  if (reproductiveHistory?.nulliparous) {
    const contribution = RISK_FACTORS.HORMONAL.nulliparous * 10;
    totalScore += contribution;
    factors.push({
      factor: "Nulliparous",
      contribution,
    });
  }

  if (reproductiveHistory?.firstChildAfter30) {
    const contribution = RISK_FACTORS.HORMONAL.firstChildAfter30 * 10;
    totalScore += contribution;
    factors.push({
      factor: "First child after 30",
      contribution,
    });
  }

  return {
    score: totalScore,
    factors,
  };
}

function getRiskCategory(score) {
  if (score >= 75) return "very-high";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

function generateRiskBasedRecommendations(score, category, findings) {
  const recommendations = [];

  // Base recommendations
  if (category === "very-high") {
    recommendations.push(
      "Consider genetic counseling and testing",
      "Enhanced screening with MRI recommended",
      "Discuss risk-reduction strategies with clinician"
    );
  } else if (category === "high") {
    recommendations.push(
      "Annual mammography recommended",
      "Consider supplemental screening",
      "Discuss risk factors with clinician"
    );
  }

  // Lesion-specific recommendations
  const suspiciousFindings = findings.filter(
    (f) => f.birads?.category.startsWith("4") || f.birads?.category === "5"
  );

  if (suspiciousFindings.length > 0) {
    recommendations.push(
      `${suspiciousFindings.length} suspicious findings require further evaluation`
    );
  }

  // Density consideration
  if (findings.some((f) => f.characteristics?.density === "D")) {
    recommendations.push(
      "Extremely dense breast tissue - consider tomosynthesis or ultrasound"
    );
  }

  return recommendations;
}
