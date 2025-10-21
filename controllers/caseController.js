// controllers/caseController.js
const PatientCase = require('../models/PatientCase');
const DiagnosticReport = require('../models/DiagnosticReport');
const DashboardStatistics = require('../models/DashboardStatistics');

// Get dashboard statistics
exports.getDashboardStatistics = async (req, res) => {
  try {
    const totalCases = await PatientCase.countDocuments();
    const pendingCases = await PatientCase.countDocuments({
      status: 'pending',
    });
    const inProgressCases = await PatientCase.countDocuments({
      status: 'in-progress',
    });
    const completedCases = await PatientCase.countDocuments({
      status: 'completed',
    });
    const highPriorityCases = await PatientCase.countDocuments({
      priority: 'high',
    });

    // Calculate average turnaround time (simplified)
    const completedCasesWithDates = await PatientCase.find({
      status: 'completed',
      studyDate: { $exists: true },
      updatedAt: { $exists: true },
    });

    let totalTurnaround = 0;
    completedCasesWithDates.forEach((caseItem) => {
      const turnaround =
        (caseItem.updatedAt - caseItem.studyDate) / (1000 * 60 * 60 * 24);
      totalTurnaround += turnaround;
    });

    const averageTurnaround =
      completedCasesWithDates.length > 0
        ? (totalTurnaround / completedCasesWithDates.length).toFixed(1) +
          ' days'
        : '0 days';

    const statistics = {
      totalCases,
      pendingCases,
      inProgressCases,
      completedCases,
      highPriorityCases,
      averageTurnaroundTime: averageTurnaround,
    };

    res.json(statistics);
  } catch (error) {
    console.error('Error fetching dashboard statistics:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
};

// Get cases with filters and pagination
exports.getCasesWithFilters = async (req, res) => {
  try {
    const {
      studyType,
      priority,
      status,
      page = 1,
      itemsPerPage = 10,
      search,
    } = req.query;

    // Build filter object
    const filter = {};

    if (studyType && studyType !== '') filter.studyType = studyType;
    if (priority && priority !== '') filter.priority = priority;
    if (status && status !== '') filter.status = status;

    // Search filter
    if (search && search !== '') {
      filter.$or = [
        { patientName: { $regex: search, $options: 'i' } },
        { patientId: { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum = parseInt(page);
    const limit = parseInt(itemsPerPage);
    const skip = (pageNum - 1) * limit;

    // Get cases with population
    const cases = await PatientCase.find(filter)
      .populate('assignedRadiologist', 'name email')
      .sort({ priority: -1, dueDate: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total count for pagination
    const total = await PatientCase.countDocuments(filter);

    res.json({
      cases,
      pagination: {
        currentPage: pageNum,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (error) {
    console.error('Error fetching cases:', error);
    res.status(500).json({ error: 'Failed to fetch cases' });
  }
};

// Get single case by ID
exports.getCaseById = async (req, res) => {
  try {
    const { id } = req.params;

    const patientCase = await PatientCase.findById(id)
      .populate('assignedRadiologist', 'name email specialization')
      .populate('previousStudies')
      .populate('images.annotations.createdBy', 'name');

    if (!patientCase) {
      return res.status(404).json({ error: 'Case not found' });
    }

    res.json(patientCase);
  } catch (error) {
    console.error('Error fetching case:', error);
    res.status(500).json({ error: 'Failed to fetch case' });
  }
};

// Create new case
exports.createCase = async (req, res) => {
  try {
    const caseData = {
      ...req.body,
      createdBy: req.user.id, // From authentication middleware
    };

    const newCase = new PatientCase(caseData);
    await newCase.save();

    // Populate before sending response
    await newCase.populate('assignedRadiologist', 'name email');

    res.status(201).json(newCase);
  } catch (error) {
    console.error('Error creating case:', error);
    res.status(400).json({ error: 'Failed to create case' });
  }
};

// Update case status
exports.updateCaseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const updatedCase = await PatientCase.findByIdAndUpdate(
      id,
      {
        status,
        updatedAt: new Date(),
      },
      { new: true, runValidators: true },
    ).populate('assignedRadiologist', 'name email');

    if (!updatedCase) {
      return res.status(404).json({ error: 'Case not found' });
    }

    res.json(updatedCase);
  } catch (error) {
    console.error('Error updating case status:', error);
    res.status(400).json({ error: 'Failed to update case status' });
  }
};

// Assign case to radiologist
exports.assignCaseToRadiologist = async (req, res) => {
  try {
    const { id } = req.params;
    const { radiologistId } = req.body;

    const updatedCase = await PatientCase.findByIdAndUpdate(
      id,
      {
        assignedRadiologist: radiologistId,
        status: 'in-progress',
        updatedAt: new Date(),
      },
      { new: true, runValidators: true },
    ).populate('assignedRadiologist', 'name email');

    if (!updatedCase) {
      return res.status(404).json({ error: 'Case not found' });
    }

    res.json(updatedCase);
  } catch (error) {
    console.error('Error assigning case:', error);
    res.status(400).json({ error: 'Failed to assign case' });
  }
};

// Search cases
exports.searchCases = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const cases = await PatientCase.find({
      $or: [
        { patientName: { $regex: q, $options: 'i' } },
        { patientId: { $regex: q, $options: 'i' } },
      ],
    })
      .populate('assignedRadiologist', 'name email')
      .sort({ priority: -1, dueDate: 1 })
      .limit(50)
      .lean();

    res.json(cases);
  } catch (error) {
    console.error('Error searching cases:', error);
    res.status(500).json({ error: 'Failed to search cases' });
  }
};
