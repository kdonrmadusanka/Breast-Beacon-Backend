// controllers/exportController.js
import DiagnosticReport from '../models/DiagnosticReport.js';
import PatientCase from '../models/PatientCase.js';
import PDFDocument from 'pdfkit';
import { Parser } from 'json2csv'; // You'll need to install json2csv

/**
 * Export case report in multiple formats with comprehensive validation
 */
export const exportCaseReport = async (req, res) => {
  try {
    const { caseId } = req.params;
    const { format = 'pdf', includeAnnotations = 'false' } = req.query;

    // Validate required parameters
    if (!caseId || caseId.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Case ID is required',
      });
    }

    // Validate format
    const validFormats = ['pdf', 'json', 'csv', 'html'];
    if (!validFormats.includes(format.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid format. Must be one of: ${validFormats.join(', ')}`,
      });
    }

    // Fetch report with comprehensive population
    const report = await DiagnosticReport.findOne({ caseId: caseId.trim() })
      .populate('createdBy', 'name email licenseNumber signature')
      .populate('signedBy', 'name email licenseNumber signature')
      .populate({
        path: 'caseId',
        populate: [
          { path: 'assignedRadiologist', select: 'name email specialization' },
          { path: 'previousStudies', select: 'studyDate studyType findings' },
        ],
      });

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found for this case',
      });
    }

    // Check if report is finalized
    if (!report.isFinal && format === 'pdf') {
      return res.status(400).json({
        success: false,
        error: 'Cannot export PDF for unfinalized reports',
      });
    }

    // Fetch case with annotations if requested
    let caseWithAnnotations = null;
    if (includeAnnotations === 'true') {
      caseWithAnnotations = await PatientCase.findById(caseId.trim())
        .populate('images.annotations.createdBy', 'name email')
        .select('images patientName patientId');
    }

    const fileName = `report-${report.caseId.patientId}-${Date.now()}`;

    switch (format.toLowerCase()) {
      case 'pdf':
        await exportAsPDF(report, caseWithAnnotations, res, fileName);
        break;

      case 'json':
        await exportAsJSON(report, caseWithAnnotations, res, fileName);
        break;

      case 'csv':
        await exportAsCSV(report, res, fileName);
        break;

      case 'html':
        await exportAsHTML(report, res, fileName);
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Unsupported export format',
        });
    }
  } catch (error) {
    console.error('Error exporting report:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid case ID format',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to export report',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Export report as PDF with comprehensive formatting
 */
const exportAsPDF = async (report, caseWithAnnotations, res, fileName) => {
  try {
    const doc = new PDFDocument({
      margin: 50,
      size: 'A4',
      info: {
        Title: `Diagnostic Report - ${report.caseId.patientName}`,
        Author: report.createdBy?.name || 'Radiology System',
        Subject: 'Diagnostic Radiology Report',
        Keywords: 'radiology, diagnostic, report, medical',
      },
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}.pdf"`,
    );

    doc.pipe(res);

    // Header
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#2c3e50')
      .text('DIAGNOSTIC RADIOLOGY REPORT', { align: 'center' });

    doc.moveDown(0.5);
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#7f8c8d')
      .text(
        `Report ID: ${report._id} | Generated: ${new Date().toLocaleString()}`,
        { align: 'center' },
      );

    doc.moveDown(1);

    // Patient Information Section
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#2c3e50')
      .text('PATIENT INFORMATION', { underline: true });

    doc.moveDown(0.3);
    doc.font('Helvetica').fillColor('#000000');

    const patientInfo = [
      `Patient Name: ${report.caseId.patientName || 'N/A'}`,
      `Patient ID: ${report.caseId.patientId || 'N/A'}`,
      `Date of Birth: ${
        report.caseId.patientDOB
          ? new Date(report.caseId.patientDOB).toLocaleDateString()
          : 'N/A'
      }`,
      `Study Date: ${
        report.caseId.studyDate
          ? new Date(report.caseId.studyDate).toLocaleDateString()
          : 'N/A'
      }`,
      `Study Type: ${report.caseId.studyType || 'N/A'}`,
      `Referring Physician: ${report.caseId.referringPhysician || 'N/A'}`,
    ];

    patientInfo.forEach((info) => {
      doc.text(info);
    });

    doc.moveDown(1);

    // Clinical Information
    if (report.caseId.clinicalHistory) {
      doc.font('Helvetica-Bold').text('CLINICAL HISTORY', { underline: true });
      doc.moveDown(0.3);
      doc
        .font('Helvetica')
        .text(report.caseId.clinicalHistory || 'None provided');
      doc.moveDown(1);
    }

    // Report Content
    const sections = [
      { title: 'TECHNIQUE', content: report.technique },
      { title: 'COMPARISON', content: report.comparison },
      { title: 'FINDINGS', content: report.findings },
      { title: 'IMPRESSION', content: report.impression },
      { title: 'RECOMMENDATIONS', content: report.recommendations },
    ];

    sections.forEach((section) => {
      if (section.content) {
        doc.font('Helvetica-Bold').text(section.title, { underline: true });
        doc.moveDown(0.3);
        doc.font('Helvetica').text(section.content || 'None provided');
        doc.moveDown(1);
      }
    });

    // BI-RADS Score if available
    if (report.biradsScore) {
      doc
        .font('Helvetica-Bold')
        .text('BI-RADS ASSESSMENT', { underline: true });
      doc.moveDown(0.3);
      doc
        .font('Helvetica')
        .text(
          `Category ${report.biradsScore}: ${getBiradsDescription(
            report.biradsScore,
          )}`,
        );
      doc.moveDown(1);
    }

    // Annotations section if included
    if (
      caseWithAnnotations &&
      caseWithAnnotations.images &&
      caseWithAnnotations.images.length > 0
    ) {
      doc.addPage();
      doc.font('Helvetica-Bold').text('IMAGE ANNOTATIONS', { align: 'center' });
      doc.moveDown(1);

      caseWithAnnotations.images.forEach((image, index) => {
        if (image.annotations && image.annotations.length > 0) {
          doc
            .font('Helvetica-Bold')
            .text(`Image: ${image.name || `Image ${index + 1}`}`);
          doc.moveDown(0.3);

          image.annotations.forEach((annotation, annIndex) => {
            doc
              .font('Helvetica')
              .text(
                `${annIndex + 1}. ${annotation.type.toUpperCase()}: ${
                  annotation.note || 'No description'
                }`,
                {
                  indent: 20,
                },
              );
          });
          doc.moveDown(0.5);
        }
      });
    }

    // Footer with signatures
    doc.addPage();
    doc.font('Helvetica-Bold').text('SIGNATURES', { align: 'center' });
    doc.moveDown(1);

    const signatureY = doc.y;

    // Radiologist signature
    doc
      .font('Helvetica-Bold')
      .text('INTERPRETING RADIOLOGIST:', 50, signatureY);
    doc
      .font('Helvetica')
      .text(report.createdBy?.name || 'N/A', 50, signatureY + 20);
    doc.text(
      `License: ${report.createdBy?.licenseNumber || 'N/A'}`,
      50,
      signatureY + 35,
    );
    doc.text(
      `Date: ${
        report.createdAt
          ? new Date(report.createdAt).toLocaleDateString()
          : 'N/A'
      }`,
      50,
      signatureY + 50,
    );

    // Final signature if available
    if (report.signedBy) {
      doc.font('Helvetica-Bold').text('FINAL SIGNATURE:', 300, signatureY);
      doc.font('Helvetica').text(report.signedBy.name, 300, signatureY + 20);
      doc.text(
        `License: ${report.signedBy.licenseNumber || 'N/A'}`,
        300,
        signatureY + 35,
      );
      doc.text(
        `Date: ${
          report.signedAt
            ? new Date(report.signedAt).toLocaleDateString()
            : 'N/A'
        }`,
        300,
        signatureY + 50,
      );
    }

    // Final disclaimer
    doc.y = 500;
    doc
      .fontSize(8)
      .font('Helvetica-Oblique')
      .fillColor('#7f8c8d')
      .text(
        'This is an electronically generated report. No physical signature is required.',
        { align: 'center' },
      );

    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF export');
  }
};

/**
 * Export report as JSON
 */
const exportAsJSON = async (report, caseWithAnnotations, res, fileName) => {
  try {
    const exportData = {
      report: report.toObject(),
      metadata: {
        exportedAt: new Date().toISOString(),
        format: 'json',
        version: '1.0',
      },
    };

    if (caseWithAnnotations) {
      exportData.annotations = caseWithAnnotations.images.map((img) => ({
        imageId: img._id,
        imageName: img.name,
        annotations: img.annotations,
      }));
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}.json"`,
    );
    res.json(exportData);
  } catch (error) {
    console.error('Error generating JSON:', error);
    throw new Error('Failed to generate JSON export');
  }
};

/**
 * Export report as CSV
 */
const exportAsCSV = async (report, res, fileName) => {
  try {
    const csvData = {
      'Report ID': report._id.toString(),
      'Patient Name': report.caseId.patientName,
      'Patient ID': report.caseId.patientId,
      'Study Date': report.caseId.studyDate
        ? new Date(report.caseId.studyDate).toISOString()
        : '',
      'Study Type': report.caseId.studyType,
      'BI-RADS Score': report.biradsScore || '',
      Findings: report.findings || '',
      Impression: report.impression || '',
      Recommendations: report.recommendations || '',
      Radiologist: report.createdBy?.name || '',
      Finalized: report.isFinal ? 'Yes' : 'No',
      'Signed By': report.signedBy?.name || '',
      'Signed At': report.signedAt
        ? new Date(report.signedAt).toISOString()
        : '',
      'Created At': report.createdAt
        ? new Date(report.createdAt).toISOString()
        : '',
    };

    const parser = new Parser();
    const csv = parser.parse([csvData]);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}.csv"`,
    );
    res.send(csv);
  } catch (error) {
    console.error('Error generating CSV:', error);
    throw new Error('Failed to generate CSV export');
  }
};

/**
 * Export report as HTML
 */
const exportAsHTML = async (report, res, fileName) => {
  try {
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Diagnostic Report - ${report.caseId.patientName}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
        .section { margin-bottom: 25px; }
        .section-title { font-weight: bold; font-size: 16px; border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-bottom: 10px; }
        .patient-info { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .signature { margin-top: 50px; padding-top: 20px; border-top: 1px solid #ccc; }
        .footer { margin-top: 50px; font-size: 12px; color: #666; text-align: center; }
    </style>
</head>
<body>
    <div class="header">
        <h1>DIAGNOSTIC RADIOLOGY REPORT</h1>
        <p>Generated: ${new Date().toLocaleString()}</p>
    </div>

    <div class="section">
        <div class="section-title">PATIENT INFORMATION</div>
        <div class="patient-info">
            <div><strong>Patient Name:</strong> ${
              report.caseId.patientName
            }</div>
            <div><strong>Patient ID:</strong> ${report.caseId.patientId}</div>
            <div><strong>Study Date:</strong> ${
              report.caseId.studyDate
                ? new Date(report.caseId.studyDate).toLocaleDateString()
                : 'N/A'
            }</div>
            <div><strong>Study Type:</strong> ${report.caseId.studyType}</div>
        </div>
    </div>

    ${
      report.findings
        ? `
    <div class="section">
        <div class="section-title">FINDINGS</div>
        <div>${report.findings.replace(/\n/g, '<br>')}</div>
    </div>
    `
        : ''
    }

    ${
      report.impression
        ? `
    <div class="section">
        <div class="section-title">IMPRESSION</div>
        <div>${report.impression.replace(/\n/g, '<br>')}</div>
    </div>
    `
        : ''
    }

    ${
      report.recommendations
        ? `
    <div class="section">
        <div class="section-title">RECOMMENDATIONS</div>
        <div>${report.recommendations.replace(/\n/g, '<br>')}</div>
    </div>
    `
        : ''
    }

    <div class="signature">
        <div><strong>Interpreting Radiologist:</strong> ${
          report.createdBy?.name || 'N/A'
        }</div>
        <div><strong>License Number:</strong> ${
          report.createdBy?.licenseNumber || 'N/A'
        }</div>
        <div><strong>Date:</strong> ${
          report.createdAt
            ? new Date(report.createdAt).toLocaleDateString()
            : 'N/A'
        }</div>
        
        ${
          report.signedBy
            ? `
        <div style="margin-top: 20px;">
            <strong>Final Signature:</strong> ${report.signedBy.name}<br>
            <strong>License Number:</strong> ${
              report.signedBy.licenseNumber || 'N/A'
            }<br>
            <strong>Signed Date:</strong> ${
              report.signedAt
                ? new Date(report.signedAt).toLocaleDateString()
                : 'N/A'
            }
        </div>
        `
            : ''
        }
    </div>

    <div class="footer">
        <p>This is an electronically generated report. No physical signature is required.</p>
    </div>
</body>
</html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}.html"`,
    );
    res.send(htmlContent);
  } catch (error) {
    console.error('Error generating HTML:', error);
    throw new Error('Failed to generate HTML export');
  }
};

/**
 * Helper function to get BI-RADS description
 */
const getBiradsDescription = (score) => {
  const descriptions = {
    0: 'Incomplete - Need additional imaging evaluation',
    1: 'Negative',
    2: 'Benign findings',
    3: 'Probably benign',
    4: 'Suspicious abnormality',
    5: 'Highly suggestive of malignancy',
    6: 'Known biopsy-proven malignancy',
  };
  return descriptions[score] || 'Unknown category';
};

export default {
  exportCaseReport,
};
