// controllers/templateController.js
import ReportTemplate from '../models/ReportTemplate.js';

/**
 * Get all templates with comprehensive filtering and security
 */
export const getReportTemplates = async (req, res) => {
  try {
    const {
      studyType,
      isPublic,
      search,
      sortBy = 'usageCount',
      sortOrder = 'desc',
      page = 1,
      itemsPerPage = 20,
    } = req.query;

    // Build filter with security - user can see public templates or their own
    const filter = {
      $or: [{ isPublic: true }, { createdBy: req.user?.id }],
    };

    // Additional filters
    if (studyType && studyType.trim() !== '') {
      filter.studyType = studyType.trim();
    }

    if (isPublic !== undefined) {
      filter.isPublic = isPublic === 'true';
    }

    // Search functionality
    if (search && search.trim() !== '') {
      const searchRegex = { $regex: search.trim(), $options: 'i' };
      filter.$and = [
        { ...filter.$and },
        {
          $or: [
            { name: searchRegex },
            { description: searchRegex },
            { studyType: searchRegex },
            { 'createdBy.name': searchRegex },
          ],
        },
      ];
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const limit = Math.min(Math.max(1, parseInt(itemsPerPage)), 50);
    const skip = (pageNum - 1) * limit;

    // Sort configuration
    const sort = {};
    const validSortFields = [
      'usageCount',
      'name',
      'createdAt',
      'updatedAt',
      'studyType',
    ];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'usageCount';
    sort[sortField] = sortOrder === 'asc' ? 1 : -1;

    const [templates, total] = await Promise.all([
      ReportTemplate.find(filter)
        .populate('createdBy', 'name email role')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      ReportTemplate.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        templates,
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
    console.error('Error fetching templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch templates',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get template by ID with comprehensive validation
 */
export const getTemplateById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || id.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Template ID is required',
      });
    }

    const template = await ReportTemplate.findOne({
      _id: id.trim(),
      $or: [{ isPublic: true }, { createdBy: req.user?.id }],
    }).populate('createdBy', 'name email role');

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found or access denied',
      });
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error('Error fetching template:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid template ID format',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch template',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Create new template with comprehensive validation
 */
export const createTemplate = async (req, res) => {
  try {
    const templateData = {
      ...req.body,
      createdBy: req.user?.id,
    };

    // Validate required fields
    const requiredFields = ['name', 'studyType', 'findings', 'impression'];
    const missingFields = requiredFields.filter(
      (field) => !templateData[field],
    );

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
      });
    }

    // Validate study type if provided
    const validStudyTypes = [
      'CT',
      'MRI',
      'X-Ray',
      'Ultrasound',
      'Mammography',
      'PET-CT',
    ];
    if (
      templateData.studyType &&
      !validStudyTypes.includes(templateData.studyType)
    ) {
      return res.status(400).json({
        success: false,
        error: `Invalid study type. Must be one of: ${validStudyTypes.join(
          ', ',
        )}`,
      });
    }

    // Check for duplicate template name for the same user
    const existingTemplate = await ReportTemplate.findOne({
      name: templateData.name.trim(),
      createdBy: req.user?.id,
    });

    if (existingTemplate) {
      return res.status(409).json({
        success: false,
        error: 'Template with this name already exists for your account',
      });
    }

    const newTemplate = new ReportTemplate({
      ...templateData,
      name: templateData.name.trim(),
      usageCount: 0,
    });

    await newTemplate.save();
    await newTemplate.populate('createdBy', 'name email role');

    res.status(201).json({
      success: true,
      data: newTemplate,
      message: 'Template created successfully',
    });
  } catch (error) {
    console.error('Error creating template:', error);

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
      error: 'Failed to create template',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Update template with comprehensive validation and security
 */
export const updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || id.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Template ID is required',
      });
    }

    // Check if template exists and user has permission
    const existingTemplate = await ReportTemplate.findOne({
      _id: id.trim(),
      createdBy: req.user?.id,
    });

    if (!existingTemplate) {
      return res.status(404).json({
        success: false,
        error: 'Template not found or access denied',
      });
    }

    // Validate study type if provided in update
    if (req.body.studyType) {
      const validStudyTypes = [
        'CT',
        'MRI',
        'X-Ray',
        'Ultrasound',
        'Mammography',
        'PET-CT',
      ];
      if (!validStudyTypes.includes(req.body.studyType)) {
        return res.status(400).json({
          success: false,
          error: `Invalid study type. Must be one of: ${validStudyTypes.join(
            ', ',
          )}`,
        });
      }
    }

    // Check for duplicate name if name is being updated
    if (req.body.name && req.body.name !== existingTemplate.name) {
      const duplicateTemplate = await ReportTemplate.findOne({
        name: req.body.name.trim(),
        createdBy: req.user?.id,
        _id: { $ne: id.trim() },
      });

      if (duplicateTemplate) {
        return res.status(409).json({
          success: false,
          error:
            'Another template with this name already exists for your account',
        });
      }
    }

    const template = await ReportTemplate.findOneAndUpdate(
      { _id: id.trim(), createdBy: req.user?.id },
      {
        ...req.body,
        ...(req.body.name && { name: req.body.name.trim() }),
        updatedAt: new Date(),
      },
      {
        new: true,
        runValidators: true,
      },
    ).populate('createdBy', 'name email role');

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found after update',
      });
    }

    res.json({
      success: true,
      data: template,
      message: 'Template updated successfully',
    });
  } catch (error) {
    console.error('Error updating template:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid template ID format',
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
      error: 'Failed to update template',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Increment template usage with comprehensive validation
 */
export const incrementTemplateUsage = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || id.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Template ID is required',
      });
    }

    // Check if template exists and is accessible (public or user's own)
    const existingTemplate = await ReportTemplate.findOne({
      _id: id.trim(),
      $or: [{ isPublic: true }, { createdBy: req.user?.id }],
    });

    if (!existingTemplate) {
      return res.status(404).json({
        success: false,
        error: 'Template not found or access denied',
      });
    }

    const template = await ReportTemplate.findByIdAndUpdate(
      id.trim(),
      {
        $inc: { usageCount: 1 },
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      },
      { new: true },
    ).populate('createdBy', 'name email role');

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found after usage update',
      });
    }

    res.json({
      success: true,
      data: template,
      message: 'Template usage incremented successfully',
    });
  } catch (error) {
    console.error('Error incrementing template usage:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid template ID format',
      });
    }

    res.status(400).json({
      success: false,
      error: 'Failed to update template usage',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Delete template with security validation
 */
export const deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || id.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Template ID is required',
      });
    }

    const template = await ReportTemplate.findOneAndDelete({
      _id: id.trim(),
      createdBy: req.user?.id,
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found or access denied',
      });
    }

    res.json({
      success: true,
      message: 'Template deleted successfully',
      deletedTemplate: {
        id: template._id,
        name: template.name,
      },
    });
  } catch (error) {
    console.error('Error deleting template:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid template ID format',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to delete template',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export default {
  getReportTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  incrementTemplateUsage,
  deleteTemplate,
};
