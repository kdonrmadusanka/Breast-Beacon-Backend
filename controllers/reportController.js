// controllers/reportController.js
const DiagnosticReport = require('../models/DiagnosticReport');
const PatientCase = require('../models/PatientCase');

// Get report by case ID
exports.getReportByCaseId = async (req, res) => {
  try {
    const { caseId } = req.params;

    const report = await DiagnosticReport.findOne({ caseId })
      .populate('createdBy', 'name email')
      .populate('signedBy', 'name email');

    res.json(report);
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
};

// Create new report
exports.createReport = async (req, res) => {
  try {
    const reportData = {
      ...req.body,
      createdBy: req.user.id,
    };

    // Check if case exists
    const patientCase = await PatientCase.findById(reportData.caseId);
    if (!patientCase) {
      return res.status(404).json({ error: 'Case not found' });
    }

    // Check if report already exists
    const existingReport = await DiagnosticReport.findOne({
      caseId: reportData.caseId,
    });
    if (existingReport) {
      return res
        .status(400)
        .json({ error: 'Report already exists for this case' });
    }

    const newReport = new DiagnosticReport(reportData);
    await newReport.save();

    // Update case status if report is finalized
    if (reportData.isFinal) {
      await PatientCase.findByIdAndUpdate(reportData.caseId, {
        status: 'completed',
        updatedAt: new Date(),
      });
    }

    await newReport.populate('createdBy', 'name email');

    res.status(201).json(newReport);
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(400).json({ error: 'Failed to create report' });
  }
};

// Update report
exports.updateReport = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const report = await DiagnosticReport.findByIdAndUpdate(
      id,
      {
        ...updateData,
        updatedAt: new Date(),
      },
      { new: true, runValidators: true },
    )
      .populate('createdBy', 'name email')
      .populate('signedBy', 'name email');

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Update case status if report is finalized
    if (updateData.isFinal) {
      await PatientCase.findByIdAndUpdate(report.caseId, {
        status: 'completed',
        updatedAt: new Date(),
      });
    }

    res.json(report);
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(400).json({ error: 'Failed to update report' });
  }
};

// Finalize report
exports.finalizeReport = async (req, res) => {
  try {
    const { id } = req.params;

    const report = await DiagnosticReport.findByIdAndUpdate(
      id,
      {
        isFinal: true,
        signedBy: req.user.id,
        signedAt: new Date(),
        updatedAt: new Date(),
      },
      { new: true, runValidators: true },
    )
      .populate('createdBy', 'name email')
      .populate('signedBy', 'name email');

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Update case status to completed
    await PatientCase.findByIdAndUpdate(report.caseId, {
      status: 'completed',
      updatedAt: new Date(),
    });

    res.json(report);
  } catch (error) {
    console.error('Error finalizing report:', error);
    res.status(400).json({ error: 'Failed to finalize report' });
  }
};
