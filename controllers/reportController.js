// controllers/reportController.js
import DiagnosticReport from '../models/DiagnosticReport.js';
import PatientCase from '../models/PatientCase.js';

/**
 * Get report by case ID with comprehensive validation
 */
export const getReportByCaseId = async (req, res) => {
  try {
    const { caseId } = req.params;

    if (!caseId || caseId.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Case ID is required',
      });
    }

    const report = await DiagnosticReport.findOne({ caseId: caseId.trim() })
      .populate('createdBy', 'name email role')
      .populate('signedBy', 'name email role')
      .populate('caseId', 'patientName patientId studyType priority status');

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found for this case',
        caseId: caseId.trim(),
      });
    }

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error('Error fetching report:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid case ID format',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch report',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Create new diagnostic report with comprehensive validation
 */
export const createReport = async (req, res) => {
  try {
    const reportData = {
      ...req.body,
      createdBy: req.user?.id,
    };

    // Validate required fields
    const requiredFields = ['caseId', 'findings', 'impression'];
    const missingFields = requiredFields.filter((field) => !reportData[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    // Validate case exists and is in progress
    const patientCase = await PatientCase.findById(reportData.caseId);
    if (!patientCase) {
      return res.status(404).json({
        success: false,
        error: 'Case not found',
      });
    }

    if (patientCase.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot create report for completed case',
      });
    }

    // Check if report already exists
    const existingReport = await DiagnosticReport.findOne({
      caseId: reportData.caseId,
    });

    if (existingReport) {
      return res.status(409).json({
        success: false,
        error: 'Report already exists for this case',
        existingReportId: existingReport._id,
      });
    }

    const newReport = new DiagnosticReport(reportData);
    await newReport.save();

    // Update case status if report is finalized
    if (reportData.isFinal) {
      await PatientCase.findByIdAndUpdate(reportData.caseId, {
        status: 'completed',
        updatedAt: new Date(),
        completedAt: new Date(),
      });
    } else {
      // Update case status to in-progress if not already
      await PatientCase.findByIdAndUpdate(reportData.caseId, {
        status: 'in-progress',
        updatedAt: new Date(),
      });
    }

    // Comprehensive population
    await newReport.populate([
      { path: 'createdBy', select: 'name email role' },
      { path: 'signedBy', select: 'name email role' },
      {
        path: 'caseId',
        select: 'patientName patientId studyType priority status',
      },
    ]);

    res.status(201).json({
      success: true,
      data: newReport,
      message: reportData.isFinal
        ? 'Report created and finalized successfully'
        : 'Report created successfully',
    });
  } catch (error) {
    console.error('Error creating report:', error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors,
      });
    }

    res.status(400).json({
      success: false,
      error: 'Failed to create report',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Update report with comprehensive validation
 */
export const updateReport = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!id || id.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Report ID is required',
      });
    }

    // Check if report exists and can be updated
    const existingReport = await DiagnosticReport.findById(id.trim());
    if (!existingReport) {
      return res.status(404).json({
        success: false,
        error: 'Report not found',
      });
    }

    // Prevent updates to finalized reports unless authorized
    if (existingReport.isFinal && !req.user?.isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Cannot update finalized report without admin privileges',
      });
    }

    const report = await DiagnosticReport.findByIdAndUpdate(
      id.trim(),
      {
        ...updateData,
        updatedAt: new Date(),
        // Only update signed fields if finalizing
        ...(updateData.isFinal &&
          !existingReport.isFinal && {
            signedBy: req.user?.id,
            signedAt: new Date(),
          }),
      },
      {
        new: true,
        runValidators: true,
      },
    )
      .populate('createdBy', 'name email role')
      .populate('signedBy', 'name email role')
      .populate('caseId', 'patientName patientId studyType priority status');

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found after update',
      });
    }

    // Update case status if report is being finalized
    if (updateData.isFinal && !existingReport.isFinal) {
      await PatientCase.findByIdAndUpdate(report.caseId, {
        status: 'completed',
        updatedAt: new Date(),
        completedAt: new Date(),
      });
    }

    res.json({
      success: true,
      data: report,
      message:
        updateData.isFinal && !existingReport.isFinal
          ? 'Report updated and finalized successfully'
          : 'Report updated successfully',
    });
  } catch (error) {
    console.error('Error updating report:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid report ID format',
      });
    }

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors,
      });
    }

    res.status(400).json({
      success: false,
      error: 'Failed to update report',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Finalize report with comprehensive validation
 */
export const finalizeReport = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || id.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Report ID is required',
      });
    }

    const existingReport = await DiagnosticReport.findById(id.trim());
    if (!existingReport) {
      return res.status(404).json({
        success: false,
        error: 'Report not found',
      });
    }

    if (existingReport.isFinal) {
      return res.status(400).json({
        success: false,
        error: 'Report is already finalized',
        finalizedAt: existingReport.signedAt,
      });
    }

    // Validate report has required content before finalizing
    if (!existingReport.findings || !existingReport.impression) {
      return res.status(400).json({
        success: false,
        error: 'Cannot finalize report without findings and impression',
      });
    }

    const report = await DiagnosticReport.findByIdAndUpdate(
      id.trim(),
      {
        isFinal: true,
        signedBy: req.user?.id,
        signedAt: new Date(),
        updatedAt: new Date(),
      },
      {
        new: true,
        runValidators: true,
      },
    )
      .populate('createdBy', 'name email role')
      .populate('signedBy', 'name email role')
      .populate('caseId', 'patientName patientId studyType priority status');

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found after finalization',
      });
    }

    // Update case status to completed
    await PatientCase.findByIdAndUpdate(report.caseId, {
      status: 'completed',
      updatedAt: new Date(),
      completedAt: new Date(),
    });

    res.json({
      success: true,
      data: report,
      message: 'Report finalized successfully',
    });
  } catch (error) {
    console.error('Error finalizing report:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid report ID format',
      });
    }

    res.status(400).json({
      success: false,
      error: 'Failed to finalize report',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get all reports with pagination and filtering
 */
export const getAllReports = async (req, res) => {
  try {
    const {
      page = 1,
      itemsPerPage = 10,
      isFinal,
      createdAfter,
      createdBefore,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limit = Math.min(Math.max(1, parseInt(itemsPerPage)), 100);
    const skip = (pageNum - 1) * limit;

    const filter = {};

    if (isFinal !== undefined) {
      filter.isFinal = isFinal === 'true';
    }

    if (createdAfter) {
      filter.createdAt = { ...filter.createdAt, $gte: new Date(createdAfter) };
    }

    if (createdBefore) {
      filter.createdAt = { ...filter.createdAt, $lte: new Date(createdBefore) };
    }

    const [reports, total] = await Promise.all([
      DiagnosticReport.find(filter)
        .populate('createdBy', 'name email role')
        .populate('signedBy', 'name email role')
        .populate('caseId', 'patientName patientId studyType priority status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      DiagnosticReport.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        reports,
        pagination: {
          currentPage: pageNum,
          itemsPerPage: limit,
          totalPages: Math.ceil(total / limit),
          total,
          hasNext: pageNum < Math.ceil(total / limit),
          hasPrev: pageNum > 1,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reports',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export default {
  getReportByCaseId,
  createReport,
  updateReport,
  finalizeReport,
  getAllReports,
};
