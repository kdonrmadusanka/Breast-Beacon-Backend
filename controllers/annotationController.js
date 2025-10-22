// controllers/annotationController.js
import PatientCase from '../models/PatientCase.js';

/**
 * Add annotation to image with comprehensive validation
 */
export const addImageAnnotation = async (req, res) => {
  try {
    const { caseId, imageId } = req.params;
    const annotationData = {
      ...req.body,
      createdBy: req.user?.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Validate required parameters
    if (!caseId || caseId.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Case ID is required',
      });
    }

    if (!imageId || imageId.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Image ID is required',
      });
    }

    // Validate annotation data
    const requiredFields = ['type', 'coordinates'];
    const missingFields = requiredFields.filter(
      (field) => !annotationData[field],
    );

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required annotation fields: ${missingFields.join(
          ', ',
        )}`,
      });
    }

    // Validate annotation type
    const validAnnotationTypes = [
      'point',
      'rectangle',
      'circle',
      'polygon',
      'line',
      'text',
    ];
    if (!validAnnotationTypes.includes(annotationData.type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid annotation type. Must be one of: ${validAnnotationTypes.join(
          ', ',
        )}`,
      });
    }

    // Validate coordinates based on type
    if (!isValidCoordinates(annotationData.type, annotationData.coordinates)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid coordinates for the specified annotation type',
      });
    }

    const patientCase = await PatientCase.findOneAndUpdate(
      {
        _id: caseId.trim(),
        'images._id': imageId.trim(),
      },
      {
        $push: {
          'images.$.annotations': annotationData,
        },
        updatedAt: new Date(),
      },
      {
        new: true,
        runValidators: true,
      },
    ).populate('images.annotations.createdBy', 'name email role');

    if (!patientCase) {
      return res.status(404).json({
        success: false,
        error: 'Case or image not found',
      });
    }

    // Get the newly added annotation
    const image = patientCase.images.id(imageId.trim());
    if (!image) {
      return res.status(404).json({
        success: false,
        error: 'Image not found after update',
      });
    }

    const newAnnotation = image.annotations[image.annotations.length - 1];

    res.status(201).json({
      success: true,
      data: newAnnotation,
      message: 'Annotation added successfully',
    });
  } catch (error) {
    console.error('Error adding annotation:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid case ID or image ID format',
      });
    }

    res.status(400).json({
      success: false,
      error: 'Failed to add annotation',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Delete annotation from image with comprehensive validation
 */
export const deleteImageAnnotation = async (req, res) => {
  try {
    const { caseId, imageId, annotationId } = req.params;

    // Validate required parameters
    if (!caseId || caseId.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Case ID is required',
      });
    }

    if (!imageId || imageId.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Image ID is required',
      });
    }

    if (!annotationId || annotationId.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Annotation ID is required',
      });
    }

    // Check if user has permission to delete (creator or admin)
    const patientCase = await PatientCase.findOne({
      _id: caseId.trim(),
      'images._id': imageId.trim(),
      'images.annotations._id': annotationId.trim(),
    });

    if (!patientCase) {
      return res.status(404).json({
        success: false,
        error: 'Case, image or annotation not found',
      });
    }

    const image = patientCase.images.id(imageId.trim());
    const annotation = image.annotations.id(annotationId.trim());

    // Check permission - user can delete their own annotations or admin can delete any
    const isOwner = annotation.createdBy?.toString() === req.user?.id;
    const isAdmin = req.user?.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied. You can only delete your own annotations',
      });
    }

    const updatedCase = await PatientCase.findOneAndUpdate(
      {
        _id: caseId.trim(),
        'images._id': imageId.trim(),
      },
      {
        $pull: {
          'images.$.annotations': { _id: annotationId.trim() },
        },
        updatedAt: new Date(),
      },
      { new: true },
    );

    if (!updatedCase) {
      return res.status(404).json({
        success: false,
        error: 'Failed to delete annotation',
      });
    }

    res.json({
      success: true,
      message: 'Annotation deleted successfully',
      deletedAnnotationId: annotationId.trim(),
    });
  } catch (error) {
    console.error('Error deleting annotation:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid case ID, image ID or annotation ID format',
      });
    }

    res.status(400).json({
      success: false,
      error: 'Failed to delete annotation',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Update annotation with comprehensive validation
 */
export const updateImageAnnotation = async (req, res) => {
  try {
    const { caseId, imageId, annotationId } = req.params;
    const updateData = {
      ...req.body,
      updatedAt: new Date(),
    };

    // Validate required parameters
    if (!caseId || caseId.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Case ID is required',
      });
    }

    if (!imageId || imageId.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Image ID is required',
      });
    }

    if (!annotationId || annotationId.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Annotation ID is required',
      });
    }

    // Check if annotation exists and user has permission
    const existingCase = await PatientCase.findOne({
      _id: caseId.trim(),
      'images._id': imageId.trim(),
      'images.annotations._id': annotationId.trim(),
    });

    if (!existingCase) {
      return res.status(404).json({
        success: false,
        error: 'Case, image or annotation not found',
      });
    }

    const image = existingCase.images.id(imageId.trim());
    const existingAnnotation = image.annotations.id(annotationId.trim());

    // Check permission - user can update their own annotations
    const isOwner = existingAnnotation.createdBy?.toString() === req.user?.id;
    const isAdmin = req.user?.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied. You can only update your own annotations',
      });
    }

    // Validate coordinates if provided in update
    if (updateData.coordinates && updateData.type) {
      if (!isValidCoordinates(updateData.type, updateData.coordinates)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid coordinates for the specified annotation type',
        });
      }
    } else if (updateData.coordinates && !updateData.type) {
      // Use existing type if coordinates are updated but type isn't
      if (
        !isValidCoordinates(existingAnnotation.type, updateData.coordinates)
      ) {
        return res.status(400).json({
          success: false,
          error: 'Invalid coordinates for the existing annotation type',
        });
      }
    }

    const patientCase = await PatientCase.findOneAndUpdate(
      {
        _id: caseId.trim(),
        'images._id': imageId.trim(),
        'images.annotations._id': annotationId.trim(),
      },
      {
        $set: {
          'images.$[image].annotations.$[annotation]': updateData,
          updatedAt: new Date(),
        },
      },
      {
        new: true,
        runValidators: true,
        arrayFilters: [
          { 'image._id': imageId.trim() },
          { 'annotation._id': annotationId.trim() },
        ],
      },
    ).populate('images.annotations.createdBy', 'name email role');

    if (!patientCase) {
      return res.status(404).json({
        success: false,
        error: 'Failed to update annotation',
      });
    }

    const updatedImage = patientCase.images.id(imageId.trim());
    const updatedAnnotation = updatedImage.annotations.id(annotationId.trim());

    res.json({
      success: true,
      data: updatedAnnotation,
      message: 'Annotation updated successfully',
    });
  } catch (error) {
    console.error('Error updating annotation:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid case ID, image ID or annotation ID format',
      });
    }

    res.status(400).json({
      success: false,
      error: 'Failed to update annotation',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Get annotations for a specific image
 */
export const getImageAnnotations = async (req, res) => {
  try {
    const { caseId, imageId } = req.params;

    // Validate required parameters
    if (!caseId || caseId.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Case ID is required',
      });
    }

    if (!imageId || imageId.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Image ID is required',
      });
    }

    const patientCase = await PatientCase.findOne({
      _id: caseId.trim(),
      'images._id': imageId.trim(),
    })
      .populate('images.annotations.createdBy', 'name email role')
      .select('images.$');

    if (
      !patientCase ||
      !patientCase.images ||
      patientCase.images.length === 0
    ) {
      return res.status(404).json({
        success: false,
        error: 'Case or image not found',
      });
    }

    const image = patientCase.images[0];
    const annotations = image.annotations || [];

    res.json({
      success: true,
      data: {
        imageId: image._id,
        imageName: image.name,
        annotations,
        totalAnnotations: annotations.length,
      },
    });
  } catch (error) {
    console.error('Error fetching annotations:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid case ID or image ID format',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch annotations',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Helper function to validate coordinates based on annotation type
 */
const isValidCoordinates = (type, coordinates) => {
  if (!coordinates || typeof coordinates !== 'object') {
    return false;
  }

  switch (type) {
    case 'point':
      return (
        typeof coordinates.x === 'number' &&
        typeof coordinates.y === 'number' &&
        coordinates.x >= 0 &&
        coordinates.y >= 0
      );

    case 'rectangle':
      return (
        typeof coordinates.x === 'number' &&
        typeof coordinates.y === 'number' &&
        typeof coordinates.width === 'number' &&
        typeof coordinates.height === 'number' &&
        coordinates.x >= 0 &&
        coordinates.y >= 0 &&
        coordinates.width > 0 &&
        coordinates.height > 0
      );

    case 'circle':
      return (
        typeof coordinates.x === 'number' &&
        typeof coordinates.y === 'number' &&
        typeof coordinates.radius === 'number' &&
        coordinates.x >= 0 &&
        coordinates.y >= 0 &&
        coordinates.radius > 0
      );

    case 'line':
      return (
        Array.isArray(coordinates.points) &&
        coordinates.points.length === 2 &&
        coordinates.points.every(
          (point) => typeof point.x === 'number' && typeof point.y === 'number',
        )
      );

    case 'polygon':
      return (
        Array.isArray(coordinates.points) &&
        coordinates.points.length >= 3 &&
        coordinates.points.every(
          (point) => typeof point.x === 'number' && typeof point.y === 'number',
        )
      );

    case 'text':
      return (
        typeof coordinates.x === 'number' &&
        typeof coordinates.y === 'number' &&
        coordinates.x >= 0 &&
        coordinates.y >= 0
      );

    default:
      return false;
  }
};

export default {
  addImageAnnotation,
  deleteImageAnnotation,
  updateImageAnnotation,
  getImageAnnotations,
};
