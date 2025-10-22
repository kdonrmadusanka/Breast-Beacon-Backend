// controllers/caseController.js
import PatientCase from '../models/PatientCase.js';
import DiagnosticReport from '../models/DiagnosticReport.js';
import DashboardStatistics from '../models/DashboardStatistics.js';

/**
 * Get comprehensive dashboard statistics
 */
export const getDashboardStatistics = async (req, res) => {
  try {
    const [
      totalCases,
      pendingCases,
      inProgressCases,
      completedCases,
      highPriorityCases,
    ] = await Promise.all([
      PatientCase.countDocuments(),
      PatientCase.countDocuments({ status: 'pending' }),
      PatientCase.countDocuments({ status: 'in-progress' }),
      PatientCase.countDocuments({ status: 'completed' }),
      PatientCase.countDocuments({ priority: 'high' }),
    ]);

    // Calculate average turnaround time with enhanced error handling
    const completedCasesWithDates = await PatientCase.find({
      status: 'completed',
      studyDate: { $exists: true, $ne: null },
      updatedAt: { $exists: true, $ne: null },
    })
      .select('studyDate updatedAt')
      .lean();

    let totalTurnaround = 0;
    let validCasesCount = 0;

    completedCasesWithDates.forEach((caseItem) => {
      if (caseItem.studyDate && caseItem.updatedAt) {
        const turnaround =
          (new Date(caseItem.updatedAt) - new Date(caseItem.studyDate)) /
          (1000 * 60 * 60 * 24);
        if (turnaround > 0) {
          totalTurnaround += turnaround;
          validCasesCount++;
        }
      }
    });

    const averageTurnaround =
      validCasesCount > 0
        ? `${(totalTurnaround / validCasesCount).toFixed(1)} days`
        : '0 days';

    const statistics = {
      totalCases,
      pendingCases,
      inProgressCases,
      completedCases,
      highPriorityCases,
      averageTurnaroundTime: averageTurnaround,
      calculatedFrom: `${validCasesCount} valid cases`,
    };

    res.json({
      success: true,
      data: statistics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching dashboard statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard statistics',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get cases with comprehensive filtering and pagination
 */
export const getCasesWithFilters = async (req, res) => {
  try {
    const {
      studyType,
      priority,
      status,
      page = 1,
      itemsPerPage = 10,
      search,
      sortBy = 'priority',
      sortOrder = 'desc',
    } = req.query;

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page));
    const limit = Math.min(Math.max(1, parseInt(itemsPerPage)), 100); // Cap at 100 items per page
    const skip = (pageNum - 1) * limit;

    // Build filter object with validation
    const filter = {};

    if (studyType && studyType.trim() !== '')
      filter.studyType = studyType.trim();
    if (priority && priority.trim() !== '') filter.priority = priority.trim();
    if (status && status.trim() !== '') filter.status = status.trim();

    // Enhanced search filter
    if (search && search.trim() !== '') {
      const searchRegex = { $regex: search.trim(), $options: 'i' };
      filter.$or = [
        { patientName: searchRegex },
        { patientId: searchRegex },
        { 'assignedRadiologist.name': searchRegex },
        { studyDescription: searchRegex },
      ];
    }

    // Build sort object
    const sort = {};
    const validSortFields = [
      'priority',
      'dueDate',
      'createdAt',
      'studyDate',
      'patientName',
    ];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'priority';
    sort[sortField] = sortOrder === 'asc' ? 1 : -1;

    // Execute queries in parallel for better performance
    const [cases, total] = await Promise.all([
      PatientCase.find(filter)
        .populate('assignedRadiologist', 'name email specialization')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      PatientCase.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        cases,
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
    console.error('Error fetching cases:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch cases',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get single case by ID with comprehensive population
 */
export const getCaseById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || id.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Case ID is required',
      });
    }

    const patientCase = await PatientCase.findById(id.trim())
      .populate('assignedRadiologist', 'name email specialization department')
      .populate('previousStudies')
      .populate('images.annotations.createdBy', 'name role')
      .populate('createdBy', 'name email');

    if (!patientCase) {
      return res.status(404).json({
        success: false,
        error: 'Case not found',
      });
    }

    res.json({
      success: true,
      data: patientCase,
    });
  } catch (error) {
    console.error('Error fetching case:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid case ID format',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch case',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Create new case with validation
 */
export const createCase = async (req, res) => {
  try {
    const caseData = {
      ...req.body,
      createdBy: req.user?.id, // From authentication middleware
    };

    // Validate required fields
    const requiredFields = [
      'patientName',
      'patientId',
      'studyType',
      'priority',
    ];
    const missingFields = requiredFields.filter((field) => !caseData[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    const newCase = new PatientCase(caseData);
    await newCase.save();

    // Comprehensive population
    await newCase.populate([
      { path: 'assignedRadiologist', select: 'name email specialization' },
      { path: 'createdBy', select: 'name email' },
    ]);

    res.status(201).json({
      success: true,
      data: newCase,
      message: 'Case created successfully',
    });
  } catch (error) {
    console.error('Error creating case:', error);

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
      error: 'Failed to create case',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Update case status with validation
 */
export const updateCaseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!id || id.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Case ID is required',
      });
    }

    // Validate status
    const validStatuses = ['pending', 'in-progress', 'completed', 'cancelled'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const updatedCase = await PatientCase.findByIdAndUpdate(
      id.trim(),
      {
        status,
        updatedAt: new Date(),
        ...(status === 'completed' && { completedAt: new Date() }),
      },
      {
        new: true,
        runValidators: true,
      },
    ).populate('assignedRadiologist', 'name email specialization');

    if (!updatedCase) {
      return res.status(404).json({
        success: false,
        error: 'Case not found',
      });
    }

    res.json({
      success: true,
      data: updatedCase,
      message: `Case status updated to ${status}`,
    });
  } catch (error) {
    console.error('Error updating case status:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid case ID format',
      });
    }

    res.status(400).json({
      success: false,
      error: 'Failed to update case status',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Assign case to radiologist with validation
 */
export const assignCaseToRadiologist = async (req, res) => {
  try {
    const { id } = req.params;
    const { radiologistId } = req.body;

    if (!id || id.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Case ID is required',
      });
    }

    if (!radiologistId || radiologistId.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Radiologist ID is required',
      });
    }

    const updatedCase = await PatientCase.findByIdAndUpdate(
      id.trim(),
      {
        assignedRadiologist: radiologistId.trim(),
        status: 'in-progress',
        assignedAt: new Date(),
        updatedAt: new Date(),
      },
      {
        new: true,
        runValidators: true,
      },
    ).populate('assignedRadiologist', 'name email specialization department');

    if (!updatedCase) {
      return res.status(404).json({
        success: false,
        error: 'Case not found',
      });
    }

    res.json({
      success: true,
      data: updatedCase,
      message: 'Case assigned to radiologist successfully',
    });
  } catch (error) {
    console.error('Error assigning case:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID format',
      });
    }

    res.status(400).json({
      success: false,
      error: 'Failed to assign case',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Enhanced case search with multiple criteria
 */
export const searchCases = async (req, res) => {
  try {
    const { q, field = 'all' } = req.query;

    if (!q || q.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Search query is required',
      });
    }

    const searchTerm = q.trim();
    const searchRegex = { $regex: searchTerm, $options: 'i' };

    let searchFilter = {};

    // Field-specific search
    switch (field) {
      case 'patientName':
        searchFilter.patientName = searchRegex;
        break;
      case 'patientId':
        searchFilter.patientId = searchRegex;
        break;
      case 'radiologist':
        searchFilter['assignedRadiologist.name'] = searchRegex;
        break;
      case 'studyDescription':
        searchFilter.studyDescription = searchRegex;
        break;
      case 'all':
      default:
        searchFilter.$or = [
          { patientName: searchRegex },
          { patientId: searchRegex },
          { 'assignedRadiologist.name': searchRegex },
          { studyDescription: searchRegex },
          { studyType: searchRegex },
        ];
        break;
    }

    const cases = await PatientCase.find(searchFilter)
      .populate('assignedRadiologist', 'name email specialization')
      .sort({ priority: -1, dueDate: 1, createdAt: -1 })
      .limit(100) // Increased limit for comprehensive search
      .lean();

    res.json({
      success: true,
      data: cases,
      metadata: {
        searchTerm,
        field,
        resultsCount: cases.length,
      },
    });
  } catch (error) {
    console.error('Error searching cases:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search cases',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export default {
  getDashboardStatistics,
  getCasesWithFilters,
  getCaseById,
  createCase,
  updateCaseStatus,
  assignCaseToRadiologist,
  searchCases,
};
