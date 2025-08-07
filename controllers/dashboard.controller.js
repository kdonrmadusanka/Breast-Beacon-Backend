// controllers/dashboard.controller.js
import Mammogram from "../models/Mammogram.js";
import Patient from "../models/Patient.js";
import { calculateBreastDensity } from "../utils/breastAnalysis.js"; // We'll create this
import { generateRiskAssessment } from "../utils/riskCalculator.js"; // We'll create this

/**
 * @swagger
 * tags:
 *   name: Patient Dashboard
 *   description: Patient dashboard and breast analysis
 */

/**
 * @swagger
 * /api/dashboard/summary/{patientId}:
 *   get:
 *     summary: Get comprehensive patient dashboard summary
 *     tags: [Patient Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *         description: Patient ID
 *     responses:
 *       200:
 *         description: Patient dashboard summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     patientInfo:
 *                       $ref: '#/components/schemas/Patient'
 *                     mammograms:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Mammogram'
 *                     analysisSummary:
 *                       type: object
 *                       properties:
 *                         densityAnalysis:
 *                           type: object
 *                           properties:
 *                             leftBreast:
 *                               type: string
 *                               enum: [A, B, C, D]
 *                               description: BI-RADS density category
 *                             rightBreast:
 *                               type: string
 *                               enum: [A, B, C, D]
 *                         riskAssessment:
 *                           type: object
 *                           properties:
 *                             score:
 *                               type: number
 *                               description: 0-100 risk score
 *                             category:
 *                               type: string
 *                               enum: [low, medium, high]
 *                         comparison:
 *                           type: object
 *                           properties:
 *                             change:
 *                               type: string
 *                               enum: [improved, stable, worsened]
 *                             details:
 *                               type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Patient not found
 *       500:
 *         description: Server error
 */
export const getDashboardSummary = async (req, res) => {
  try {
    const { patientId } = req.params;

    // Verify the requesting user has access to this patient data
    if (req.user.role === "patient" && req.user.id !== patientId) {
      return res.status(403).json({
        success: false,
        error: "You can only access your own dashboard",
      });
    }

    // Get patient info
    const patient = await Patient.findById(patientId)
      .select("-password -tokens -__v")
      .populate("primaryPhysician", "firstName lastName specialty");

    if (!patient) {
      return res.status(404).json({
        success: false,
        error: "Patient not found",
      });
    }

    // Get all mammograms sorted by date
    const mammograms = await Mammogram.find({ patientId })
      .sort({ uploadDate: -1 })
      .populate("uploadedBy", "firstName lastName role");

    // Perform advanced analysis
    const densityAnalysis = await calculateBreastDensity(mammograms);
    const riskAssessment = await generateRiskAssessment(patient, mammograms);
    const comparison = await compareWithPrevious(mammograms);

    // Prepare dashboard data
    const dashboardData = {
      patientInfo: patient,
      mammograms,
      analysisSummary: {
        densityAnalysis,
        riskAssessment,
        comparison,
        nextScreening: calculateNextScreening(patient, mammograms),
        recommendations: generateRecommendations(
          densityAnalysis,
          riskAssessment
        ),
      },
    };

    res.status(200).json({
      success: true,
      data: dashboardData,
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to load dashboard",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
};
