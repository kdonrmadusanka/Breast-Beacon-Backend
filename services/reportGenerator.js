/**
 * @swagger
 * components:
 *   schemas:
 *     RadiologyReport:
 *       type: object
 *       properties:
 *         reportId:
 *           type: string
 *         patientId:
 *           type: string
 *         mammogramId:
 *           type: string
 *         reportType:
 *           type: string
 *           enum: [screening, diagnostic, followup, biopsy]
 *         findings:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ReportFinding'
 *         impression:
 *           type: string
 *         recommendations:
 *           type: array
 *           items:
 *             type: string
 *         aiIntegration:
 *           type: object
 *           properties:
 *             findingsCorrelation:
 *               type: string
 *               enum: [concordant, discordant, partial]
 *             confidenceScore:
 *               type: number
 *         attachments:
 *           type: array
 *           items:
 *             type: string
 *         status:
 *           type: string
 *           enum: [draft, finalized, amended]
 */

import mammogramReportTemplate from "../templates/mammogramReport.js";
import { generateLesionDescription } from "../utils/lesionClassifier.js";
import { formatBiradsDescription } from "../utils/biradsCalculator.js";
import { compareMammograms } from "../utils/comparisonEngine.js";
import PDFDocument from "pdfkit";
import fs from "fs";

/**
 * Generate structured radiology report
 * @param {Object} mammogram - Mammogram document with populated analysis
 * @param {Object} radiologist - Radiologist user document
 * @param {string} reportType - Type of report to generate
 * @returns {Promise<Object>} Generated report
 */
export const generateMammogramReport = async (
  mammogram,
  radiologist,
  reportType = "screening"
) => {
  // 1. Validate input
  if (!mammogram?.analysisResults) {
    throw new Error("Mammogram analysis not available");
  }

  // 2. Prepare report data
  const { findings, densityCategory, recommendations } =
    mammogram.analysisResults;
  const priorStudies = await getPriorMammograms(
    mammogram.patientId,
    mammogram.uploadDate
  );
  const comparison =
    priorStudies.length > 0
      ? await compareMammograms(mammogram, priorStudies)
      : null;

  // 3. Generate findings descriptions
  const formattedFindings = findings.map((finding) => ({
    description: generateLesionDescription(finding),
    birads: formatBiradsDescription(finding.birads),
    location: finding.location,
    size: finding.size,
    characteristics: finding.characteristics,
  }));

  // 4. Generate AI integration notes
  const aiIntegration = {
    findingsCorrelation: calculateFindingsCorrelation(
      findings,
      mammogram.aiAnalysis
    ),
    confidenceScore: calculateAverageConfidence(findings),
    modelVersion: mammogram.aiAnalysis?.modelVersion || "2.0",
    limitations:
      "AI analysis is a decision support tool only, final interpretation requires radiologist review",
  };

  // 5. Generate report content
  const reportContent = {
    patient: mammogram.patientId,
    examDate: mammogram.uploadDate,
    indication: getIndication(reportType),
    technique: "Digital breast tomosynthesis with synthetic 2D",
    comparison: comparison
      ? `Compared to prior study from ${formatDate(
          comparison.baselineStudyDate
        )}`
      : "No prior studies available for comparison",
    findings: formattedFindings,
    density: densityCategory,
    impression: generateImpression(findings, densityCategory, comparison),
    recommendations,
    radiologist: {
      name: `${radiologist.firstName} ${radiologist.lastName}`,
      credentials: radiologist.credentials,
      signature: radiologist.signaturePath,
    },
    aiIntegration,
  };

  // 6. Generate PDF report
  const pdfPath = await generatePdfReport(reportContent, reportType);

  // 7. Create report document
  const report = {
    reportId: generateReportId(),
    patientId: mammogram.patientId,
    mammogramId: mammogram._id,
    reportType,
    findings: formattedFindings,
    impression: reportContent.impression,
    recommendations,
    aiIntegration,
    attachments: [pdfPath],
    status: "finalized",
    createdAt: new Date(),
    createdBy: radiologist._id,
  };

  return report;
};

// Helper Functions

async function getPriorMammograms(patientId, currentDate) {
  return Mammogram.find({
    patientId,
    uploadDate: { $lt: new Date(currentDate) },
  })
    .sort({ uploadDate: -1 })
    .limit(2)
    .populate("analysisResults");
}

function calculateFindingsCorrelation(findings, aiAnalysis) {
  if (!aiAnalysis) return "unknown";

  const totalFindings = findings.length;
  const concordantFindings = findings.filter((f) =>
    aiAnalysis.findings.some(
      (aiF) =>
        aiF.location.quadrant === f.location.quadrant &&
        Math.abs(aiF.size.width - f.size.width) < 5
    )
  ).length;

  if (concordantFindings === totalFindings) return "concordant";
  if (concordantFindings === 0) return "discordant";
  return "partial";
}

function calculateAverageConfidence(findings) {
  if (findings.length === 0) return 0;
  const total = findings.reduce((sum, f) => sum + (f.confidence || 0.7), 0);
  return Math.round((total / findings.length) * 100);
}

function getIndication(reportType) {
  const indications = {
    screening: "Routine breast cancer screening",
    diagnostic: "Evaluation of clinical or mammographic abnormality",
    followup: "Short-term follow-up of probably benign finding",
    biopsy: "Pre-biopsy localization",
  };
  return indications[reportType] || indications.screening;
}

function generateImpression(findings, density, comparison) {
  const significantFindings = findings.filter(
    (f) => f.birads.category.startsWith("4") || f.birads.category === "5"
  );

  if (significantFindings.length > 0) {
    return (
      `${significantFindings.length} suspicious finding(s) identified (BI-RADS ${significantFindings[0].birads.category}) ` +
      `requiring further evaluation as detailed above.`
    );
  }

  if (findings.length > 0) {
    return (
      "No suspicious findings identified. " +
      (comparison?.stabilityScore > 80
        ? "Findings are stable compared to prior study."
        : "")
    );
  }

  return `Negative mammogram (BI-RADS 1) with ${density} breast density.`;
}

async function generatePdfReport(content, reportType) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const reportDate = new Date().toISOString().split("T")[0];
    const filename = `reports/${content.patient._id}-${reportDate}-${reportType}.pdf`;
    const stream = fs.createWriteStream(filename);

    doc.pipe(stream);

    // Header
    doc.fontSize(18).text("BREAST IMAGING REPORT", { align: "center" });
    doc.moveDown();

    // Patient Info
    doc
      .fontSize(12)
      .text(`Patient: ${content.patient.name}`, { continued: true })
      .text(`DOB: ${formatDate(content.patient.birthDate)}`, {
        align: "right",
      });
    doc
      .text(`Patient ID: ${content.patient.id}`, { continued: true })
      .text(`Exam Date: ${formatDate(content.examDate)}`, { align: "right" });
    doc.moveDown();

    // Clinical Info
    doc
      .font("Helvetica-Bold")
      .text("Indication:")
      .font("Helvetica")
      .text(content.indication);
    doc.moveDown();

    // Comparison
    doc
      .font("Helvetica-Bold")
      .text("Comparison:")
      .font("Helvetica")
      .text(content.comparison);
    doc.moveDown();

    // Technique
    doc
      .font("Helvetica-Bold")
      .text("Technique:")
      .font("Helvetica")
      .text(content.technique);
    doc.moveDown();

    // Findings
    doc.font("Helvetica-Bold").text("Findings:").font("Helvetica");
    content.findings.forEach((finding, i) => {
      doc.text(`${i + 1}. ${finding.description}`);
      doc.text(
        `   BI-RADS ${finding.birads.category}: ${finding.birads.description}`
      );
      doc.moveDown(0.5);
    });

    if (content.findings.length === 0) {
      doc.text("No significant findings identified.");
      doc.moveDown();
    }

    // Breast Density
    doc
      .font("Helvetica-Bold")
      .text("Breast Density:")
      .font("Helvetica")
      .text(`The breast tissue is ${content.density}.`);
    doc.moveDown();

    // Impression
    doc
      .font("Helvetica-Bold")
      .text("Impression:")
      .font("Helvetica")
      .text(content.impression);
    doc.moveDown();

    // Recommendations
    if (content.recommendations.length > 0) {
      doc.font("Helvetica-Bold").text("Recommendations:").font("Helvetica");
      content.recommendations.forEach((rec) => {
        doc.text(`• ${rec}`);
      });
      doc.moveDown();
    }

    // Radiologist Signature
    doc.moveDown();
    doc.text(
      `Radiologist: ${content.radiologist.name}, ${content.radiologist.credentials}`
    );
    if (content.radiologist.signature) {
      doc.image(content.radiologist.signature, {
        fit: [150, 50],
        align: "left",
      });
    }
    doc.text(`Date: ${reportDate}`);

    // AI Disclaimer
    doc.moveDown();
    doc
      .fontSize(10)
      .text("AI Analysis:", { continued: true })
      .text(
        `Findings ${content.aiIntegration.findingsCorrelation} with AI detection ` +
          `(confidence score: ${content.aiIntegration.confidenceScore}%). ` +
          content.aiIntegration.limitations,
        {
          width: 500,
        }
      );

    doc.end();

    stream.on("finish", () => resolve(filename));
    stream.on("error", reject);
  });
}

function generateReportId() {
  return `RPT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function formatDate(date) {
  return new Date(date).toLocaleDateString("en-US");
}

/**
 * @swagger
 * /api/reports/generate:
 *   post:
 *     summary: Generate radiology report
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mammogramId:
 *                 type: string
 *               reportType:
 *                 type: string
 *                 enum: [screening, diagnostic, followup, biopsy]
 *     responses:
 *       201:
 *         description: Report generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RadiologyReport'
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Mammogram not found
 *       500:
 *         description: Report generation failed
 */
export const generateReport = async (req, res) => {
  try {
    const { mammogramId, reportType = "screening" } = req.body;
    const mammogram = await Mammogram.findById(mammogramId)
      .populate("patientId")
      .populate("analysisResults");

    if (!mammogram) {
      return res.status(404).json({ error: "Mammogram not found" });
    }

    const report = await generateMammogramReport(
      mammogram,
      req.user, // Assuming authenticated radiologist
      reportType
    );

    // Save to database
    const savedReport = await Report.create(report);

    res.status(201).json(savedReport);
  } catch (error) {
    console.error("Report generation error:", error);
    res.status(500).json({
      error: "Failed to generate report",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
