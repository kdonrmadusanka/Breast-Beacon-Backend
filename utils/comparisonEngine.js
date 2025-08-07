/**
 * @swagger
 * components:
 *   schemas:
 *     MammogramComparison:
 *       type: object
 *       properties:
 *         baselineStudyId:
 *           type: string
 *         currentStudyId:
 *           type: string
 *         intervalMonths:
 *           type: number
 *         changes:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [new-lesion, growing-lesion, shrinking-lesion, stable-lesion, resolved-lesion, density-change]
 *               lesionId:
 *                 type: string
 *               confidence:
 *                 type: number
 *               baselineCharacteristics:
 *                 $ref: '#/components/schemas/LesionCharacteristics'
 *               currentCharacteristics:
 *                 $ref: '#/components/schemas/LesionCharacteristics'
 *               measurements:
 *                 type: object
 *                 properties:
 *                   sizeChangePercent:
 *                     type: number
 *                   volumeChangePercent:
 *                     type: number
 *                   densityChange:
 *                     type: number
 *         summary:
 *           type: object
 *             properties:
 *               newLesionsCount:
 *                 type: number
 *               growingLesionsCount:
 *                 type: number
 *               shrinkingLesionsCount:
 *                 type: number
 *               stabilityScore:
 *                 type: number
 *               significantFindings:
 *                 type: array
 *                 items:
 *                   type: string
 */

/**
 * Compare current mammogram with prior studies
 * @param {Object} currentStudy - Current mammogram document
 * @param {Array} priorStudies - Array of prior mammogram documents
 * @returns {Object} Comparison results
 */
export const compareMammograms = async (currentStudy, priorStudies) => {
  // 1. Find most recent comparable study
  const baseline = findBaselineStudy(currentStudy, priorStudies);

  // 2. If no baseline found, return empty comparison
  if (!baseline) {
    return {
      baselineStudyId: null,
      currentStudyId: currentStudy._id,
      intervalMonths: null,
      changes: [],
      summary: {
        newLesionsCount: currentStudy.analysisResults.findings.length,
        stabilityScore: 0,
        significantFindings: [],
      },
    };
  }

  // 3. Calculate time interval between studies
  const intervalMonths = calculateIntervalMonths(
    baseline.uploadDate,
    currentStudy.uploadDate
  );

  // 4. Match lesions between studies
  const matchedLesions = matchLesions(
    currentStudy.analysisResults.findings,
    baseline.analysisResults.findings
  );

  // 5. Analyze changes
  const changes = analyzeChanges(matchedLesions);

  // 6. Generate summary
  const summary = generateComparisonSummary(changes, intervalMonths);

  return {
    baselineStudyId: baseline._id,
    currentStudyId: currentStudy._id,
    intervalMonths,
    changes,
    summary,
  };
};

/**
 * Find the most recent comparable baseline study
 */
function findBaselineStudy(currentStudy, priorStudies) {
  // Filter studies with same view and laterality
  const comparableStudies = priorStudies.filter(
    (study) =>
      study.metadata.viewPosition === currentStudy.metadata.viewPosition &&
      study.metadata.laterality === currentStudy.metadata.laterality
  );

  // Sort by date descending
  comparableStudies.sort((a, b) => b.uploadDate - a.uploadDate);

  // Return most recent with findings
  return comparableStudies.find(
    (study) => study.analysisResults?.findings?.length > 0
  );
}

/**
 * Calculate time interval in months
 */
function calculateIntervalMonths(date1, date2) {
  const diffMs = Math.abs(new Date(date2) - new Date(date1));
  return Math.round(diffMs / (1000 * 60 * 60 * 24 * 30.44));
}

/**
 * Match lesions between current and baseline studies
 */
function matchLesions(currentFindings, baselineFindings = []) {
  const matched = [];

  // Find matches for current findings
  currentFindings.forEach((current) => {
    const match = findBestMatch(current, baselineFindings);
    matched.push({
      current,
      baseline: match?.lesion || null,
      matchScore: match?.score || 0,
    });
  });

  // Identify resolved lesions (present in baseline but not current)
  baselineFindings.forEach((baseline) => {
    if (!matched.some((m) => m.baseline?.id === baseline.id)) {
      matched.push({
        current: null,
        baseline,
        matchScore: 0,
      });
    }
  });

  return matched;
}

/**
 * Find best matching lesion from baseline
 */
function findBestMatch(currentLesion, baselineLesions) {
  const MIN_MATCH_SCORE = 0.4;
  let bestMatch = null;
  let bestScore = 0;

  baselineLesions.forEach((baseline) => {
    const score = calculateMatchScore(currentLesion, baseline);
    if (score > bestScore && score >= MIN_MATCH_SCORE) {
      bestScore = score;
      bestMatch = baseline;
    }
  });

  return bestMatch ? { lesion: bestMatch, score: bestScore } : null;
}

/**
 * Calculate match score between two lesions
 */
function calculateMatchScore(lesion1, lesion2) {
  // 1. Location similarity (50% weight)
  const locScore = calculateLocationSimilarity(
    lesion1.location,
    lesion2.location
  );

  // 2. Feature similarity (30% weight)
  const featureScore = calculateFeatureSimilarity(
    lesion1.characteristics,
    lesion2.characteristics
  );

  // 3. Size similarity (20% weight)
  const sizeScore = calculateSizeSimilarity(lesion1.size, lesion2.size);

  return locScore * 0.5 + featureScore * 0.3 + sizeScore * 0.2;
}

/**
 * Calculate location similarity score
 */
function calculateLocationSimilarity(loc1, loc2) {
  if (loc1.quadrant !== loc2.quadrant) return 0;

  let score = 0.7; // Base score for same quadrant

  // Increase score for similar clock position (MLO view)
  if (loc1.clockPosition && loc2.clockPosition) {
    const clockDiff = Math.min(
      Math.abs(loc1.clockPosition - loc2.clockPosition),
      12 - Math.abs(loc1.clockPosition - loc2.clockPosition)
    );
    score += 0.3 * (1 - clockDiff / 6);
  }

  // Increase score for similar depth
  if (loc1.depth === loc2.depth) {
    score += 0.1;
  }

  return Math.min(1, score);
}

/**
 * Analyze changes between matched lesions
 */
function analyzeChanges(matchedLesions) {
  const changes = [];
  const SIZE_CHANGE_THRESHOLD = 0.2; // 20% change considered significant

  matchedLesions.forEach(({ current, baseline, matchScore }) => {
    if (!baseline && current) {
      // New lesion
      changes.push({
        type: "new-lesion",
        lesionId: current.id,
        confidence: matchScore,
        currentCharacteristics: current.characteristics,
        measurements: {
          size: calculateLesionSize(current),
        },
      });
    } else if (!current && baseline) {
      // Resolved lesion
      changes.push({
        type: "resolved-lesion",
        lesionId: baseline.id,
        confidence: 0.8,
        baselineCharacteristics: baseline.characteristics,
      });
    } else if (current && baseline) {
      // Existing lesion - check for changes
      const sizeChange = calculateSizeChange(current, baseline);
      const densityChange = calculateDensityChange(current, baseline);

      if (sizeChange > SIZE_CHANGE_THRESHOLD) {
        changes.push({
          type: "growing-lesion",
          lesionId: current.id,
          confidence: matchScore,
          baselineCharacteristics: baseline.characteristics,
          currentCharacteristics: current.characteristics,
          measurements: {
            sizeChangePercent: sizeChange * 100,
            volumeChangePercent: Math.pow(1 + sizeChange, 3) * 100,
          },
        });
      } else if (sizeChange < -SIZE_CHANGE_THRESHOLD) {
        changes.push({
          type: "shrinking-lesion",
          lesionId: current.id,
          confidence: matchScore,
          baselineCharacteristics: baseline.characteristics,
          currentCharacteristics: current.characteristics,
          measurements: {
            sizeChangePercent: sizeChange * 100,
            volumeChangePercent: Math.pow(1 + sizeChange, 3) * 100,
          },
        });
      } else {
        changes.push({
          type: "stable-lesion",
          lesionId: current.id,
          confidence: matchScore,
          baselineCharacteristics: baseline.characteristics,
          currentCharacteristics: current.characteristics,
          measurements: {
            sizeChangePercent: sizeChange * 100,
          },
        });
      }

      if (Math.abs(densityChange) > 0.15) {
        changes.push({
          type: "density-change",
          lesionId: current.id,
          confidence: matchScore,
          baselineCharacteristics: baseline.characteristics,
          currentCharacteristics: current.characteristics,
          measurements: {
            densityChange: densityChange * 100,
          },
        });
      }
    }
  });

  return changes;
}

/**
 * Generate comparison summary
 */
function generateComparisonSummary(changes, intervalMonths) {
  const changeCounts = changes.reduce((acc, change) => {
    acc[change.type] = (acc[change.type] || 0) + 1;
    return acc;
  }, {});

  // Calculate stability score (0-100)
  const stableCount = changeCounts["stable-lesion"] || 0;
  const totalCompared = changes.length - (changeCounts["new-lesion"] || 0);
  const stabilityScore =
    totalCompared > 0 ? Math.round((stableCount / totalCompared) * 100) : 0;

  // Identify significant findings
  const significantFindings = [];
  if (changeCounts["growing-lesion"]) {
    significantFindings.push(
      `${changeCounts["growing-lesion"]} lesion(s) increased in size`
    );
  }
  if (changeCounts["new-lesion"]) {
    significantFindings.push(
      `${changeCounts["new-lesion"]} new lesion(s) detected`
    );
  }

  return {
    newLesionsCount: changeCounts["new-lesion"] || 0,
    growingLesionsCount: changeCounts["growing-lesion"] || 0,
    shrinkingLesionsCount: changeCounts["shrinking-lesion"] || 0,
    resolvedLesionsCount: changeCounts["resolved-lesion"] || 0,
    stabilityScore,
    significantFindings,
    intervalMonths,
  };
}
